import os
import json
import pandas as pd
import logging
from concurrent.futures import ProcessPoolExecutor
import subprocess

# Set up logging to both console and file
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Create a file handler for logging to a file
file_handler = logging.FileHandler('script.log', mode='a')
file_handler.setLevel(logging.INFO)

# Create a console handler for logging to the console
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)

# Define a formatter and attach it to both handlers
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
file_handler.setFormatter(formatter)
console_handler.setFormatter(formatter)

# Add both handlers to the logger
logger.addHandler(file_handler)
logger.addHandler(console_handler)

input_folder = "/Users/muhammadqasim/Desktop/Work/AppStoreScrapper/apps"  # Path to the main directory containing subfolders
output_file = f"{os.path.basename(input_folder)}.csv"  # Set CSV name to the folder name

def process_file(file_path):
    try:
        logger.info(f"Processing file: {file_path}")
        with open(file_path, 'r') as f:
            data = json.load(f)
        logger.info(f"Successfully processed file: {file_path}")
        return {"email": data.get("developerEmail")}
    except json.JSONDecodeError as e:
        logger.error(f"Failed to decode JSON in file {file_path}: {e}")
        return None
    except Exception as e:
        logger.error(f"An error occurred while processing file {file_path}: {e}")
        return None

def collect_all_txt_files(root_folder):
    logger.info(f"Collecting files from {root_folder}")
    txt_files = []
    for dirpath, _, filenames in os.walk(root_folder):
        for filename in filenames:
            if filename.endswith('.txt'):
                txt_files.append(os.path.join(dirpath, filename))
    logger.info(f"Collected {len(txt_files)} .txt files from {root_folder}")
    return txt_files

def run_shell_script():
    try:
        # Change the command to run the shell script instead
        subprocess.run(["./batch_zip_clean.sh"], check=True)
        logging.info("Shell script executed successfully.")
        print("[INFO] Shell script executed successfully.")
    except subprocess.CalledProcessError as e:
        logging.error(f"Shell script failed with error: {e}")
        print(f"[ERROR] Shell script failed with error: {e}")

def main():
    try:
        logger.info("Starting to process files")
        unique_emails = set()  # Set to store unique emails
        
        # Collect all .txt files from the input folder and its subfolders
        all_txt_files = collect_all_txt_files(input_folder)
        
        # Parallel processing using ProcessPoolExecutor
        with ProcessPoolExecutor() as executor:
            logger.info(f"Found {len(all_txt_files)} files to process")
            
            # Process each file in parallel
            results = executor.map(process_file, all_txt_files)
            for result in results:
                if result and result["email"]:
                    unique_emails.add(result["email"])  # Add to the set for uniqueness
        
        # Convert the unique emails set to a list of dictionaries for pandas
        rows = [{"email": email} for email in unique_emails]
        
        # Convert to a DataFrame and save to CSV
        logger.info(f"Writing {len(rows)} unique results to CSV")
        df = pd.DataFrame(rows)
        df.to_csv(output_file, index=False, encoding='utf-8')
        logger.info(f"Successfully wrote data to {output_file}")
    
    except Exception as e:
        logger.error(f"An error occurred during the main processing: {e}")

if __name__ == "__main__":
    logger.info("Script started")
    try:
        main()
        run_shell_script()
    except Exception as e:
        logger.critical(f"Fatal error in the main function: {e}")
    logger.info("Script finished")
