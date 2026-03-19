from __future__ import annotations

import argparse
import json
from pathlib import Path

try:
    import sentencepiece as spm
except ModuleNotFoundError as exc:
    missing_pkg = exc.name or "unknown"
    raise ModuleNotFoundError(
        f"Missing dependency '{missing_pkg}'. Install with: pip install sentencepiece"
    ) from exc


def resolve_input_file(explicit_input: str | None) -> Path:
    if explicit_input:
        input_file = Path(explicit_input)
        if not input_file.exists():
            raise FileNotFoundError(f"Input file not found: {input_file}")
        return input_file

    base_dir = Path(__file__).resolve().parents[1]
    raw_dir = base_dir / "data" / "raw"
    preferred = [raw_dir / "train.txt", raw_dir / "tinystories.txt"]
    for candidate in preferred:
        if candidate.exists():
            return candidate

    txt_files = sorted(raw_dir.glob("*.txt"))
    if txt_files:
        return txt_files[0]

    raise FileNotFoundError(
        f"No .txt dataset found in {raw_dir}. "
        "Pass --input_file with a valid text file path."
    )


def parse_args() -> argparse.Namespace:
    base_dir = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description="Train a BPE tokenizer with SentencePiece.")
    parser.add_argument(
        "--input_file",
        type=str,
        default=None,
        help="Path to input .txt corpus. If omitted, auto-detects from data/raw.",
    )
    parser.add_argument(
        "--output_dir",
        type=str,
        default=str(base_dir / "output"),
        help="Folder to save tokenizer artifacts.",
    )
    parser.add_argument(
        "--model_prefix",
        type=str,
        default="tokenizer_bpe",
        help="Output file prefix. Produces <prefix>.model and <prefix>.vocab.",
    )
    parser.add_argument(
        "--vocab_size",
        type=int,
        default=8000,
        help="Tokenizer vocabulary size.",
    )
    parser.add_argument(
        "--character_coverage",
        type=float,
        default=1.0,
        help="Character coverage for SentencePiece.",
    )
    parser.add_argument(
        "--input_sentence_size",
        type=int,
        default=1000000,
        help="Number of lines sampled for training. Use -1 for all lines.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    input_file = resolve_input_file(args.input_file)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    model_prefix_path = output_dir / args.model_prefix

    trainer_kwargs = {
        "input": str(input_file),
        "model_prefix": str(model_prefix_path),
        "model_type": "bpe",
        "vocab_size": args.vocab_size,
        "character_coverage": args.character_coverage,
        "pad_id": 0,
        "unk_id": 1,
        "bos_id": 2,
        "eos_id": 3,
        "shuffle_input_sentence": True,
        "train_extremely_large_corpus": True,
    }

    if args.input_sentence_size and args.input_sentence_size > 0:
        trainer_kwargs["input_sentence_size"] = args.input_sentence_size

    print(f"Training BPE tokenizer on: {input_file}")
    spm.SentencePieceTrainer.train(**trainer_kwargs)

    model_file = model_prefix_path.with_suffix(".model")
    vocab_file = model_prefix_path.with_suffix(".vocab")
    meta_file = output_dir / f"{args.model_prefix}.meta.json"

    meta = {
        "algorithm": "bpe",
        "input_file": str(input_file),
        "model_file": str(model_file),
        "vocab_file": str(vocab_file),
        "vocab_size": args.vocab_size,
        "character_coverage": args.character_coverage,
        "input_sentence_size": args.input_sentence_size,
    }
    meta_file.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    print(f"Tokenizer model saved: {model_file}")
    print(f"Tokenizer vocab saved: {vocab_file}")
    print(f"Metadata saved:        {meta_file}")


if __name__ == "__main__":
    main()
