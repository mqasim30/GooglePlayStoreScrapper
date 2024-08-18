with open('bundleIds.txt', 'r') as file:
    bundle_ids = file.readlines()

# Remove duplicates and sort the list
unique_bundle_ids = sorted(set(bundle_ids))

# Write the unique bundle IDs back to a new file
with open('unique_bundleIds.txt', 'w') as file:
    file.writelines(unique_bundle_ids)