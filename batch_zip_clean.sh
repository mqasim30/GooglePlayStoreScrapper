#!/bin/bash

# Step 1: Move all files from data folder to split_data and divide into subfolders

# Source directory containing the text files
src_dir="apps"

# Destination base directory
dest_base_dir="data_split"

# Number of files per folder
files_per_folder=10000

# Create the destination base directory
mkdir -p "$dest_base_dir"

# Initialize folder counter
folder_counter=1

# Initialize file counter
file_counter=0

# Loop through all text files in the source directory
for file in "$src_dir"/*; do
    # Calculate current destination folder
    dest_folder="$dest_base_dir/folder_$folder_counter"

    # Create destination folder if it doesn't exist
    mkdir -p "$dest_folder"

    # Move the file to the destination folder
    mv "$file" "$dest_folder"

    # Increment the file counter
    file_counter=$((file_counter + 1))

    # Check if we've reached the limit for the current folder
    if [ "$file_counter" -ge "$files_per_folder" ]; then
        # Reset file counter and increment folder counter
        file_counter=0
        folder_counter=$((folder_counter + 1))
    fi
done

echo "Files have been successfully divided into folders."

# Wait to ensure all file operations are completed
wait

# Step 2: Compress each folder into its own .zip file

# Navigate to the destination base directory
cd "$dest_base_dir" || exit

# Compress each folder into its own .zip file
for folder in */; do
    zip -r "${folder%/}.zip" "$folder"
done

echo "Compression completed for all folders."

# Step 3: Delete all folders, leaving only the .zip files

# Loop through all items in the directory
for ITEM in "$PWD"/*; do
    if [ -d "$ITEM" ]; then
        # If the item is a directory, delete it
        rm -rf "$ITEM"
    fi
done

echo "All folders deleted, only zip files remain."
