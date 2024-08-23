#!/bin/bash

# Get the directory containing the folders (you can change this to a specific path)
parent_directory="/Users/muhammadqasim/Desktop/Work/AppStoreScrapper/data_split"

# Navigate to the directory
cd "$parent_directory" || exit

# Compress each folder into its own .zip file
for folder in */; do
    zip -r "${folder%/}.zip" "$folder"
done

echo "Compression completed for all folders."
