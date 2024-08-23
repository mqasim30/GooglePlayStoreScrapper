#!/bin/bash

# Path to the directory containing the zips and folders
DIRECTORY="/Users/muhammadqasim/Desktop/Work/AppStoreScrapper/data_split"

# Loop through all items in the directory
for ITEM in "$DIRECTORY"/*; do
    if [ -d "$ITEM" ]; then
        # If the item is a directory, delete it
        rm -rf "$ITEM"
    fi
done

echo "All folders deleted, only zip files remain."
