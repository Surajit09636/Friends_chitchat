from datasets import load_dataset
import os

# full file path (IMPORTANT ✅)
save_path = "D:/Coding/Chatapp/backend/Max/data/raw/tinystories.txt"

# make sure folder exists
os.makedirs(os.path.dirname(save_path), exist_ok=True)

# load dataset
dataset = load_dataset(
    "karpathy/tinystories-gpt4-clean",
    split="train[:20%]"  # use small part first
)

# save to file
with open(save_path, "w", encoding="utf-8") as f:
    for item in dataset:
        text = item["text"].strip()
        if text:
            f.write(text + "\n")

print("✅ Done! Saved at:", save_path)