# Tiny LLM Scratch (4GB GPU Friendly)

This is a ready-to-run learning project to train a small GPT-style model from scratch on TinyStories.

It is tuned for low VRAM GPUs (like RTX 3050 4GB) and focuses on:

- data download and cleanup
- tokenizer training
- tokenized binary dataset creation
- tiny decoder-only transformer training
- text generation from checkpoint

## Project Layout

```text
tinyllm-scratch/
  configs/
    tiny_4gb.yaml
  data/
    raw/
    tokenized/
  artifacts/
  checkpoints/
  outputs/
  scripts/
    1_download_data.py
    2_train_tokenizer.py
    3_build_dataset.py
    4_train.py
    5_generate.py
  tinyllm/
    __init__.py
    model.py
    utils.py
  requirements.txt
  run_pipeline.ps1
```

## 1) Create Env + Install

```powershell
cd tinyllm-scratch
python -m venv .venv
.venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
```

If CUDA Torch is not installed, install from PyTorch site first.

## 2) Run Full Pipeline

```powershell
.\run_pipeline.ps1
```

## 3) Run Step-by-Step (Optional)

```powershell
python scripts/1_download_data.py --max_train_samples 200000 --max_val_samples 20000
python scripts/2_train_tokenizer.py --input data/raw/train.txt --out_dir artifacts --vocab_size 8000
python scripts/3_build_dataset.py --train_text data/raw/train.txt --val_text data/raw/val.txt --tokenizer_model artifacts/tokenizer.model --out_dir data/tokenized
python scripts/4_train.py --config configs/tiny_4gb.yaml
python scripts/5_generate.py --config configs/tiny_4gb.yaml --prompt "Once upon a time"
```

## Notes

- Default config targets around 20M parameters.
- This is for learning, not production quality.
- If OOM happens, reduce:
  - `training.batch_size`
  - `model.block_size`
  - `training.grad_accum_steps` (only if needed)
