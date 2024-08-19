# Read file1.txt and file2.txt
with open('file1.txt', 'r') as file1, open('file2.txt', 'r') as file2:
    # Read lines from both files and strip any whitespace
    file1_ids = {line.strip() for line in file1}
    file2_ids = {line.strip() for line in file2}

# Find the intersection of both sets (common appIds)
common_ids = file1_ids.intersection(file2_ids)

# Write the common ids to file3.txt
with open('file3.txt', 'w') as file3:
    for app_id in common_ids:
        file3.write(f"{app_id}\n")

print(f"Found {len(common_ids)} common appIds. Written to file3.txt")
