from __future__ import annotations

import argparse
import math
from pathlib import Path
from typing import Any

import torch
import torch.nn as nn
import torch.nn.functional as F


class CausalSelfAttention(nn.Module):
    def __init__(self, n_embd: int, n_head: int, dropout: float, block_size: int):
        super().__init__()
        if n_embd % n_head != 0:
            raise ValueError("n_embd must be divisible by n_head")

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


class Max(nn.Module):
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

    def forward(self, idx: torch.Tensor):
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
        return logits

    @torch.no_grad()
    def generate(
        self,
        idx: torch.Tensor,
        max_new_tokens: int,
        temperature: float = 1.0,
        top_k: int = 0,
    ) -> torch.Tensor:
        self.eval()
        for _ in range(max_new_tokens):
            idx_cond = idx[:, -self.block_size :]
            logits = self(idx_cond)
            logits = logits[:, -1, :] / temperature

            if top_k > 0:
                top_k = min(top_k, logits.size(-1))
                values, _ = torch.topk(logits, top_k)
                logits = logits.masked_fill(logits < values[:, [-1]], float("-inf"))

            probs = F.softmax(logits, dim=-1)
            idx_next = torch.multinomial(probs, num_samples=1)
            idx = torch.cat((idx, idx_next), dim=1)
        return idx


def parse_args() -> argparse.Namespace:
    project_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description="Generate text from a TinyLLM checkpoint.")
    parser.add_argument(
        "--checkpoint-path",
        type=Path,
        default=project_root / "checkpoints" / "gpt_char.pt",
        help="Path to model checkpoint file.",
    )
    parser.add_argument(
        "--prompt",
        type=str,
        default=None,
        help="Prompt text. If omitted, the script starts interactive mode.",
    )
    parser.add_argument("--max-new-tokens", type=int, default=200)
    parser.add_argument("--temperature", type=float, default=0.9)
    parser.add_argument("--top-k", type=int, default=40)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--device", type=str, default="auto", choices=["auto", "cuda", "cpu"])
    return parser.parse_args()


def choose_device(device_arg: str) -> str:
    if device_arg == "auto":
        return "cuda" if torch.cuda.is_available() else "cpu"
    return device_arg


def safe_torch_load(path: Path, device: str):
    try:
        return torch.load(path, map_location=device, weights_only=False)
    except TypeError:
        return torch.load(path, map_location=device)


def get_model_state_dict(checkpoint: dict[str, Any]) -> dict[str, torch.Tensor]:
    if "model_state_dict" in checkpoint and isinstance(checkpoint["model_state_dict"], dict):
        return checkpoint["model_state_dict"]
    if "state_dict" in checkpoint and isinstance(checkpoint["state_dict"], dict):
        return checkpoint["state_dict"]
    if "model" in checkpoint and isinstance(checkpoint["model"], dict):
        return checkpoint["model"]
    raise KeyError(
        "Could not find model weights in checkpoint. Expected one of: "
        "'model_state_dict', 'state_dict', or 'model'."
    )


def normalize_state_dict_keys(state_dict: dict[str, torch.Tensor]) -> dict[str, torch.Tensor]:
    remapped: dict[str, torch.Tensor] = {}
    for key, value in state_dict.items():
        new_key = key
        new_key = new_key.replace("token_emb.", "token_embedding_table.")
        new_key = new_key.replace("pos_emb.", "position_embedding_table.")
        new_key = new_key.replace("head.", "lm_head.")
        new_key = new_key.replace(".ff.", ".ffwd.")
        remapped[new_key] = value
    return remapped


def load_state_dict_flexible(model: nn.Module, state_dict: dict[str, torch.Tensor]) -> None:
    candidates = [state_dict, normalize_state_dict_keys(state_dict)]
    errors: list[str] = []
    for candidate in candidates:
        try:
            model.load_state_dict(candidate, strict=True)
            return
        except RuntimeError as exc:
            errors.append(str(exc))
    raise RuntimeError(
        "Failed to load checkpoint weights into model.\n"
        f"Attempt 1 error:\n{errors[0]}\n\n"
        f"Attempt 2 error:\n{errors[1]}"
    )


def find_first(mapping: dict[str, Any], keys: tuple[str, ...], default: Any = None) -> Any:
    for key in keys:
        if key in mapping:
            return mapping[key]
    return default


def infer_model_config(
    checkpoint: dict[str, Any], state_dict: dict[str, torch.Tensor]
) -> dict[str, int | float]:
    raw_config = checkpoint.get("config")
    if not isinstance(raw_config, dict):
        raw_config = checkpoint.get("model_config")
    if not isinstance(raw_config, dict):
        raw_config = checkpoint.get("model_args")
    if not isinstance(raw_config, dict):
        raw_config = {}

    token_w = state_dict.get("token_embedding_table.weight")
    if token_w is None:
        token_w = state_dict.get("token_emb.weight")

    pos_w = state_dict.get("position_embedding_table.weight")
    if pos_w is None:
        pos_w = state_dict.get("pos_emb.weight")

    vocab_size = find_first(raw_config, ("vocab_size", "n_vocab"), None)
    if vocab_size is None and token_w is not None:
        vocab_size = token_w.shape[0]

    n_embd = find_first(raw_config, ("n_embd", "d_model", "hidden_size"), None)
    if n_embd is None and token_w is not None:
        n_embd = token_w.shape[1]

    n_head = find_first(raw_config, ("n_head", "n_heads", "num_heads"), None)
    n_layer = find_first(raw_config, ("n_layer", "n_layers", "num_layers"), None)
    block_size = find_first(raw_config, ("block_size", "context_length", "max_seq_len"), None)
    if block_size is None and pos_w is not None:
        block_size = pos_w.shape[0]

    dropout = find_first(raw_config, ("dropout",), 0.1)

    if n_layer is None:
        block_ids = {
            int(key.split(".")[1])
            for key in state_dict.keys()
            if key.startswith("blocks.") and key.split(".")[1].isdigit()
        }
        if block_ids:
            n_layer = max(block_ids) + 1

    missing = []
    for name, value in {
        "vocab_size": vocab_size,
        "n_embd": n_embd,
        "n_head/n_heads": n_head,
        "n_layer/n_layers": n_layer,
        "block_size": block_size,
    }.items():
        if value is None:
            missing.append(name)

    if missing:
        raise KeyError(
            "Missing model config fields in checkpoint: "
            + ", ".join(missing)
            + "."
        )

    return {
        "vocab_size": int(vocab_size),
        "n_embd": int(n_embd),
        "n_head": int(n_head),
        "n_layer": int(n_layer),
        "block_size": int(block_size),
        "dropout": float(dropout),
    }


def build_decoder(itos_obj):
    if isinstance(itos_obj, dict):
        return lambda token_ids: "".join(itos_obj.get(i, "") for i in token_ids)
    return lambda token_ids: "".join(
        itos_obj[i] if 0 <= i < len(itos_obj) else "" for i in token_ids
    )


def generate_text(
    model: Max,
    prompt: str,
    stoi: dict[str, int],
    decode,
    device: str,
    max_new_tokens: int,
    temperature: float,
    top_k: int,
) -> str:
    if temperature <= 0:
        raise ValueError("temperature must be > 0")

    default_token_id = stoi.get(" ", 0)
    prompt_ids = [stoi.get(ch, default_token_id) for ch in prompt]
    if not prompt_ids:
        prompt_ids = [default_token_id]

    context = torch.tensor([prompt_ids], dtype=torch.long, device=device)
    output_ids = model.generate(
        context,
        max_new_tokens=max_new_tokens,
        temperature=temperature,
        top_k=top_k,
    )[0].tolist()
    full_text = decode(output_ids)
    if full_text.startswith(prompt):
        return full_text[len(prompt) :].lstrip()
    return full_text


def main() -> None:
    args = parse_args()
    if args.seed is not None:
        torch.manual_seed(args.seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(args.seed)

    if not args.checkpoint_path.exists():
        raise FileNotFoundError(f"Checkpoint not found: {args.checkpoint_path}")

    device = choose_device(args.device)
    checkpoint = safe_torch_load(args.checkpoint_path, device=device)
    state_dict = get_model_state_dict(checkpoint)
    config = infer_model_config(checkpoint, state_dict)
    model = Max(
        vocab_size=config["vocab_size"],
        n_embd=config["n_embd"],
        n_head=config["n_head"],
        n_layer=config["n_layer"],
        block_size=config["block_size"],
        dropout=config["dropout"],
    ).to(device)
    load_state_dict_flexible(model, state_dict)
    model.eval()

    stoi = checkpoint["stoi"]
    decode = build_decoder(checkpoint["itos"])

    print(f"Loaded checkpoint: {args.checkpoint_path}")
    print(f"Using device: {device}")

    if args.prompt is not None:
        response = generate_text(
            model=model,
            prompt=args.prompt,
            stoi=stoi,
            decode=decode,
            device=device,
            max_new_tokens=args.max_new_tokens,
            temperature=args.temperature,
            top_k=args.top_k,
        )
        print("\n=== RESPONSE ===")
        print(response)
        return

    print("\nInteractive mode. Type 'exit' or 'quit' to stop.\n")
    while True:
        prompt = input("Prompt> ").strip()
        if prompt.lower() in {"exit", "quit"}:
            break
        if not prompt:
            continue

        response = generate_text(
            model=model,
            prompt=prompt,
            stoi=stoi,
            decode=decode,
            device=device,
            max_new_tokens=args.max_new_tokens,
            temperature=args.temperature,
            top_k=args.top_k,
        )
        print("\nModel:")
        print(response)
        print()


if __name__ == "__main__":
    main()
