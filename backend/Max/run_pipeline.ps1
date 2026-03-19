$ErrorActionPreference = "Stop"

python scripts/1_download_data.py --max_train_samples 200000 --max_val_samples 20000
python scripts/2_train_tokenizer.py --input data/raw/train.txt --out_dir artifacts --vocab_size 8000
python scripts/3_build_dataset.py --train_text data/raw/train.txt --val_text data/raw/val.txt --tokenizer_model artifacts/tokenizer.model --out_dir data/tokenized
python scripts/4_train.py --config configs/tiny_4gb.yaml
python scripts/5_generate.py --config configs/tiny_4gb.yaml --prompt "Once upon a time"
