#!/bin/bash

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
