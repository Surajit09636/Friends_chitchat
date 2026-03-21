import argparse
import math
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F


def set_seed(seed: int) -> None:
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


class CausalSelfAttention(nn.Module):
    def __init__(self, n_embd: int, n_head: int, dropout: float, block_size: int):
        super().__init__()
        assert n_embd % n_head == 0, "n_embd must be divisible by n_head"
        self.n_head = n_head
        self.head_dim = n_embd // n_head

        self.qkv = nn.Linear(n_embd, 3 * n_embd, bias=False)
        self.proj = nn.Linear(n_embd, n_embd, bias=False)
        self.attn_dropout = nn.Dropout(dropout)
        self.resid_dropout = nn.Dropout(dropout)
        self.register_buffer(
            "mask",
            torch.tril(torch.ones(block_size, block_size)).view(1, 1, block_size, block_size),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        bsz, seq_len, channels = x.shape
        qkv = self.qkv(x)
        q, k, v = qkv.split(channels, dim=2)

        q = q.view(bsz, seq_len, self.n_head, self.head_dim).transpose(1, 2)
        k = k.view(bsz, seq_len, self.n_head, self.head_dim).transpose(1, 2)
        v = v.view(bsz, seq_len, self.n_head, self.head_dim).transpose(1, 2)

        att = (q @ k.transpose(-2, -1)) * (1.0 / math.sqrt(self.head_dim))
        att = att.masked_fill(self.mask[:, :, :seq_len, :seq_len] == 0, float("-inf"))
        att = F.softmax(att, dim=-1)
        att = self.attn_dropout(att)

        y = att @ v
        y = y.transpose(1, 2).contiguous().view(bsz, seq_len, channels)
        return self.resid_dropout(self.proj(y))


class FeedForward(nn.Module):
    def __init__(self, n_embd: int, dropout: float):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(n_embd, 4 * n_embd),
            nn.GELU(),
            nn.Linear(4 * n_embd, n_embd),
            nn.Dropout(dropout),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class Block(nn.Module):
    def __init__(self, n_embd: int, n_head: int, dropout: float, block_size: int):
        super().__init__()
        self.ln1 = nn.LayerNorm(n_embd)
        self.attn = CausalSelfAttention(n_embd, n_head, dropout, block_size)
        self.ln2 = nn.LayerNorm(n_embd)
        self.ffwd = FeedForward(n_embd, dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = x + self.attn(self.ln1(x))
        x = x + self.ffwd(self.ln2(x))
        return x


class GPTLanguageModel(nn.Module):
    def __init__(
        self,
        vocab_size: int,
        n_embd: int,
        n_head: int,
        n_layer: int,
        block_size: int,
        dropout: float,
    ):
        super().__init__()
        self.block_size = block_size
        self.token_embedding_table = nn.Embedding(vocab_size, n_embd)
        self.position_embedding_table = nn.Embedding(block_size, n_embd)
        self.blocks = nn.Sequential(
            *[Block(n_embd, n_head, dropout, block_size) for _ in range(n_layer)]
        )
        self.ln_f = nn.LayerNorm(n_embd)
        self.lm_head = nn.Linear(n_embd, vocab_size, bias=False)
        self.apply(self._init_weights)

    def _init_weights(self, module: nn.Module) -> None:
        if isinstance(module, nn.Linear):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)
            if module.bias is not None:
                nn.init.zeros_(module.bias)
        elif isinstance(module, nn.Embedding):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)

    def forward(self, idx: torch.Tensor, targets: torch.Tensor | None = None):
        bsz, seq_len = idx.shape
        if seq_len > self.block_size:
            raise ValueError(
                f"Sequence length {seq_len} exceeds block size {self.block_size}"
            )

        tok_emb = self.token_embedding_table(idx)
        pos = torch.arange(seq_len, device=idx.device)
        pos_emb = self.position_embedding_table(pos)[None, :, :]
        x = tok_emb + pos_emb
        x = self.blocks(x)
        x = self.ln_f(x)
        logits = self.lm_head(x)

        loss = None
        if targets is not None:
            bsz, seq_len, channels = logits.shape
            loss = F.cross_entropy(
                logits.view(bsz * seq_len, channels), targets.view(bsz * seq_len)
            )
        return logits, loss

    @torch.no_grad()
    def generate(self, idx: torch.Tensor, max_new_tokens: int) -> torch.Tensor:
        self.eval()
        for _ in range(max_new_tokens):
            idx_cond = idx[:, -self.block_size :]
            logits, _ = self(idx_cond)
            logits = logits[:, -1, :]
            probs = F.softmax(logits, dim=-1)
            idx_next = torch.multinomial(probs, num_samples=1)
            idx = torch.cat((idx, idx_next), dim=1)
        return idx


def get_batch(
    split: str,
    train_data: torch.Tensor,
    val_data: torch.Tensor,
    block_size: int,
    batch_size: int,
    device: str,
):
    source = train_data if split == "train" else val_data
    ix = torch.randint(len(source) - block_size - 1, (batch_size,))
    x = torch.stack([source[i : i + block_size] for i in ix])
    y = torch.stack([source[i + 1 : i + block_size + 1] for i in ix])
    return x.to(device), y.to(device)


@torch.no_grad()
def estimate_loss(
    model: GPTLanguageModel,
    eval_iters: int,
    train_data: torch.Tensor,
    val_data: torch.Tensor,
    block_size: int,
    batch_size: int,
    device: str,
):
    model.eval()
    out = {}
    for split in ["train", "val"]:
        losses = torch.zeros(eval_iters)
        for k in range(eval_iters):
            xb, yb = get_batch(
                split=split,
                train_data=train_data,
                val_data=val_data,
                block_size=block_size,
                batch_size=batch_size,
                device=device,
            )
            _, loss = model(xb, yb)
            losses[k] = loss.item()
        out[split] = losses.mean().item()
    model.train()
    return out


def parse_args():
    project_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description="Train a tiny char-level GPT model.")
    parser.add_argument(
        "--data-path",
        type=Path,
        default=project_root / "data" / "raw" / "tinystories.txt",
        help="Path to text file used for training.",
    )
    parser.add_argument(
        "--checkpoint-path",
        type=Path,
        default=project_root / "checkpoints" / "gpt_char.pt",
        help="Where to save best validation checkpoint.",
    )
    parser.add_argument("--device", type=str, default="auto", choices=["auto", "cuda", "cpu"])
    parser.add_argument("--seed", type=int, default=1337)
    parser.add_argument("--max-chars", type=int, default=5_000_000)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--block-size", type=int, default=128)
    parser.add_argument("--max-iters", type=int, default=10000)
    parser.add_argument("--eval-interval", type=int, default=200)
    parser.add_argument("--eval-iters", type=int, default=100)
    parser.add_argument("--learning-rate", type=float, default=3e-4)
    parser.add_argument("--weight-decay", type=float, default=1e-2)
    parser.add_argument("--grad-clip", type=float, default=1.0)
    parser.add_argument("--n-embd", type=int, default=256)
    parser.add_argument("--n-head", type=int, default=8)
    parser.add_argument("--n-layer", type=int, default=6)
    parser.add_argument("--dropout", type=float, default=0.1)
    parser.add_argument("--prompt", type=str, default="Once upon a time")
    parser.add_argument("--max-new-tokens", type=int, default=400)
    return parser.parse_args()


def main():
    args = parse_args()
    set_seed(args.seed)

    if args.device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"
    else:
        device = args.device
    print(f"Using device: {device}")

    if not args.data_path.exists():
        raise FileNotFoundError(
            f"Data file not found: {args.data_path}. "
            "Download/build your training text first."
        )

    text = args.data_path.read_text(encoding="utf-8")
    if args.max_chars is not None:
        text = text[: args.max_chars]
    print(f"Loaded {len(text):,} characters from {args.data_path}")

    chars = sorted(list(set(text)))
    vocab_size = len(chars)
    stoi = {ch: i for i, ch in enumerate(chars)}
    itos = {i: ch for ch, i in stoi.items()}
    default_token_id = stoi.get(" ", 0)

    def encode(s: str) -> list[int]:
        return [stoi.get(c, default_token_id) for c in s]

    def decode(tokens: list[int]) -> str:
        return "".join(itos[i] for i in tokens)

    data = torch.tensor(encode(text), dtype=torch.long)
    if len(data) < args.block_size + 2:
        raise ValueError(
            f"Dataset is too small ({len(data)} tokens). "
            f"Need at least {args.block_size + 2} tokens."
        )

    split_idx = int(0.9 * len(data))
    train_data = data[:split_idx]
    val_data = data[split_idx:]
    print(
        f"Vocab size: {vocab_size} | Train tokens: {len(train_data):,} | Val tokens: {len(val_data):,}"
    )

    model = GPTLanguageModel(
        vocab_size=vocab_size,
        n_embd=args.n_embd,
        n_head=args.n_head,
        n_layer=args.n_layer,
        block_size=args.block_size,
        dropout=args.dropout,
    ).to(device)
    optimizer = torch.optim.AdamW(
        model.parameters(), lr=args.learning_rate, weight_decay=args.weight_decay
    )

    num_params = sum(p.numel() for p in model.parameters())
    print(f"Model parameters: {num_params / 1e6:.2f}M")

    best_val = float("inf")
    for step in range(args.max_iters + 1):
        if step % args.eval_interval == 0 or step == args.max_iters:
            losses = estimate_loss(
                model=model,
                eval_iters=args.eval_iters,
                train_data=train_data,
                val_data=val_data,
                block_size=args.block_size,
                batch_size=args.batch_size,
                device=device,
            )
            print(
                f"step {step:5d} | train loss {losses['train']:.4f} | val loss {losses['val']:.4f}"
            )
            if losses["val"] < best_val:
                best_val = losses["val"]
                args.checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
                torch.save(
                    {
                        "model_state_dict": model.state_dict(),
                        "optimizer_state_dict": optimizer.state_dict(),
                        "config": {
                            "vocab_size": vocab_size,
                            "block_size": args.block_size,
                            "n_embd": args.n_embd,
                            "n_head": args.n_head,
                            "n_layer": args.n_layer,
                            "dropout": args.dropout,
                        },
                        "stoi": stoi,
                        "itos": itos,
                    },
                    args.checkpoint_path,
                )
                print(f"  saved checkpoint to: {args.checkpoint_path}")

        xb, yb = get_batch(
            split="train",
            train_data=train_data,
            val_data=val_data,
            block_size=args.block_size,
            batch_size=args.batch_size,
            device=device,
        )
        _, loss = model(xb, yb)

        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), args.grad_clip)
        optimizer.step()

    context = torch.tensor([encode(args.prompt)], dtype=torch.long, device=device)
    generated = model.generate(context, max_new_tokens=args.max_new_tokens)[0].tolist()
    print("\n=== SAMPLE ===")
    print(decode(generated))


if __name__ == "__main__":
    main()
