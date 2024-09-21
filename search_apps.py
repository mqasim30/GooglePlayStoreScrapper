import requests
import time
import logging
from datetime import datetime, timedelta
import subprocess

# Configure logging
logging.basicConfig(
    filename='script.log',
    filemode='a',
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    level=logging.INFO
)

CX = 'c5f7cde4c5c08421d'

START_DATE_SHORT = "20 Sep 2024"  # Starting from the latest date in short form
START_DATE_FULL = "20 September 2024"  # Starting from the latest date in full form

END_DATE_SHORT = "11 Sep 2024"  # End date in short form
END_DATE_FULL = "11 September 2024"  # End date in full form

DATE_FORMATS = ["%d %b %Y","%d %B %Y"]
CONDITIONS = ["game", "-game"]  # Game condition variations

QUERIES_TEMPLATE = [
    'site:https://play.google.com/store/apps/details "{DATE}" "0+"',
    'site:https://play.google.com/store/apps/details "{DATE}" "1+"',
    'site:https://play.google.com/store/apps/details "{DATE}" "5+"',
    'site:https://play.google.com/store/apps/details "{DATE}" "10+"',
    'site:https://play.google.com/store/apps/details "{DATE}" "50+"',
    'site:https://play.google.com/store/apps/details "{DATE}" "100+"',
    'site:https://play.google.com/store/apps/details "{DATE}" "500+"',
    'site:https://play.google.com/store/apps/details "{DATE}" "1K+"',
    'site:https://play.google.com/store/apps/details "{DATE}" "10K+"',
    'site:https://play.google.com/store/apps/details "{DATE}" "50K+"',
    'site:https://play.google.com/store/apps/details "{DATE}" "100K+"',
    'site:https://play.google.com/store/apps/details "{DATE}" "500K+"',
    'site:https://play.google.com/store/apps/details "{DATE}" "1M+"',
    'site:https://play.google.com/store/apps/details "{DATE}" "5M+"',
    'site:https://play.google.com/store/apps/details "{DATE}" "10M+"'
]

RESULTS_PER_PAGE = 10
MAX_RESULTS = 100
OUTPUT_FILE = 'bundleIds.txt'
TOTAL_RESULTS = 0

# Load API keys from a file
def load_api_keys(file_path):
    with open(file_path, 'r') as file:
        return [line.strip() for line in file if line.strip()]

def get_search_results(query, start_index, api_key):
    url = f"https://www.googleapis.com/customsearch/v1"
    params = {
        'key': api_key,
        'cx': CX,
        'q': query,
        'start': start_index,
        'num': RESULTS_PER_PAGE,
        'gl': 'us',
    }
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()  # This will raise an exception for HTTP errors
        return response.json()
    except requests.exceptions.HTTPError as e:
        if response.status_code == 429 or response.status_code == 403:
            logging.error(f"API key rate limit exceeded: {e}")
            print(f"[ERROR] API key rate limit exceeded: {e}")
            if response.status_code == 403:
                # Save the corrupt API key to a file
                with open('corrupt_api.txt', 'a') as corrupt_file:
                    corrupt_file.write(api_key + '\n')
                logging.info(f"Saved corrupt API key to corrupt_api.txt: {api_key}")

            return "RATE_LIMIT"
        else:
            logging.error(f"Failed to fetch results: {e}")
            print(f"[ERROR] Failed to fetch results: {e}")
            return None

def extract_bundle_id(url):
    if "id=" in url:
        start = url.find("id=") + len("id=")
        end = url.find("&", start)
        if end == -1:
            return url[start:]  # No '&' after the ID, return till the end
        else:
            return url[start:end]
    return None

def process_query(query, api_key):
    logging.info(f"Starting search for query: {query}")
    print(f"[INFO] Starting search for query: {query}")
    all_results = []
    
    with open(OUTPUT_FILE, 'a') as file:
        for start in range(1, MAX_RESULTS + 1, RESULTS_PER_PAGE):
            logging.info(f"Fetching results {start} to {start + RESULTS_PER_PAGE - 1}...")
            print(f"[INFO] Fetching results {start} to {start + RESULTS_PER_PAGE - 1}...")
            results = get_search_results(query, start, api_key)

            if results == "RATE_LIMIT":
                return "RATE_LIMIT"

            if results and 'items' in results:
                fetched_results = results['items']
                all_results.extend(fetched_results)
                logging.info(f"Fetched {len(fetched_results)} results.")
                print(f"[INFO] Fetched {len(fetched_results)} results.")
                
                for result in fetched_results:
                    bundle_id = extract_bundle_id(result['link'])
                    if bundle_id:
                        file.write(bundle_id + '\n')

                if len(fetched_results) < RESULTS_PER_PAGE:
                    logging.info("Fetched fewer results than expected. Stopping further requests.")
                    print("[INFO] Fetched fewer results than expected. Stopping further requests.")
                    break
            else:
                logging.warning("No results returned or an error occurred.")
                print("[WARN] No results returned or an error occurred.")
                break

            time.sleep(0.5)  # Adding delay to avoid hitting rate limits

    logging.info(f"Total results fetched for query '{query}': {len(all_results)}")
    logging.info(f"Bundle IDs have been appended to {OUTPUT_FILE}")
    print(f"[INFO] Total results fetched for query '{query}': {len(all_results)}")
    print(f"[INFO] Bundle IDs have been appended to {OUTPUT_FILE}")
    print("[INFO] Query processing completed.")
    return len(all_results)

def remove_duplicates():
    with open('bundleIds.txt', 'r') as file:
        bundle_ids = file.readlines()
    unique_bundle_ids = set(bundle_ids)
    with open('bundleIds.txt', 'w') as file:
        file.writelines(unique_bundle_ids)
    logging.info(f"[INFO] Duplicates removed. New results counts: {len(unique_bundle_ids)}")
    print(f"[INFO] Duplicates removed. New results counts: {len(unique_bundle_ids)}")

def clear_output_file():
    with open(OUTPUT_FILE, 'w') as file:
        pass  # This will clear the file contents

def run_node_script():
    try:
        subprocess.run(["node", "appSearchGP.js", "--bundleIds"], check=True)
        logging.info("Node script executed successfully.")
        print("[INFO] Node script executed successfully.")
    except subprocess.CalledProcessError as e:
        logging.error(f"Node script failed with error: {e}")
        print(f"[ERROR] Node script failed with error: {e}")

def main():
    API_KEYS = load_api_keys('api_keys.txt')
    current_date_short = datetime.strptime(START_DATE_SHORT, "%d %b %Y")
    current_date_full = datetime.strptime(START_DATE_FULL, "%d %B %Y")
    end_date_short = datetime.strptime(END_DATE_SHORT, "%d %b %Y") if END_DATE_SHORT else None
    end_date_full = datetime.strptime(END_DATE_FULL, "%d %B %Y") if END_DATE_FULL else None
    api_key_index = 0
    global TOTAL_RESULTS

    while True:  # Infinite loop, will break when execution stops
        for date_format in DATE_FORMATS:
            if date_format == "%d %b %Y":
                current_date = current_date_short
                end_date = end_date_short
            else:
                current_date = current_date_full
                end_date = end_date_full

            # Check if the end date is reached
            if end_date and current_date < end_date:
                logging.info(f"Reached end date {end_date.strftime(date_format)} for format {date_format}.")
                print(f"[INFO] Reached end date {end_date.strftime(date_format)} for format {date_format}.")
                return

            date_total_results = 0
            formatted_date = current_date.strftime(date_format)
            logging.info(f"Processing date: {formatted_date}")
            print(f"[INFO] Processing date: {formatted_date}")

            for query_template in QUERIES_TEMPLATE:
                for condition in CONDITIONS:
                    query = query_template.replace("{DATE}", formatted_date) + f' "{condition}"'

                    retry = True
                    while retry:
                        if api_key_index >= len(API_KEYS):  # Check before accessing API_KEYS
                            logging.error("All API keys have been exhausted. Stopping execution.")
                            print("[ERROR] All API keys have been exhausted. Stopping execution.")
                            return  # Stop the script entirely

                        result = process_query(query, API_KEYS[api_key_index])

                        if result == "RATE_LIMIT":
                            api_key_index += 1
                            logging.info(f"Switching to API key index: {api_key_index}")
                            print(f"[INFO] Switching to API key index: {api_key_index}")
                        else:
                            retry = False  # Exit the retry loop only if no rate limit error

                    # Ensure result is a valid number before adding
                    if isinstance(result, int) and result > 0:
                        date_total_results += result
                    else:
                        logging.warning(f"Query returned no valid results for {formatted_date}.")
                        print(f"[WARN] Query returned no valid results for {formatted_date}.")

            TOTAL_RESULTS += date_total_results
            print(f"[INFO] Total results for {formatted_date}: {date_total_results}")

            # Update the current date based on the format
            if date_format == "%d %b %Y":
                current_date_short -= timedelta(days=1)
            else:
                current_date_full -= timedelta(days=1)




if __name__ == "__main__":
    clear_output_file()
    main()
    logging.info(f"Total results fetched for all queries: {TOTAL_RESULTS}")
    print(f"[INFO] Total results fetched for all queries: {TOTAL_RESULTS}")
    remove_duplicates()
    run_node_script()