import requests
import time
import logging
from datetime import datetime, timedelta

# Configure logging
logging.basicConfig(
    filename='script.log',
    filemode='a',
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    level=logging.INFO
)

CX = 'c5f7cde4c5c08421d'
START_DATE_SHORT = "17 Aug 2024"  # Starting from the latest date in short form
START_DATE_FULL = "17 August 2024"  # Starting from the latest date in full form
DATE_FORMATS = ["%d %b %Y", "%d %B %Y"]  # Short and long formats
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

            time.sleep(1)  # Adding delay to avoid hitting rate limits

    logging.info(f"Total results fetched for query '{query}': {len(all_results)}")
    logging.info(f"Bundle IDs have been appended to {OUTPUT_FILE}")
    print(f"[INFO] Total results fetched for query '{query}': {len(all_results)}")
    print(f"[INFO] Bundle IDs have been appended to {OUTPUT_FILE}")
    print("[INFO] Query processing completed.")
    return len(all_results)

def main():
    API_KEYS = load_api_keys('api_keys.txt')
    current_date_short = datetime.strptime(START_DATE_SHORT, "%d %b %Y")
    current_date_full = datetime.strptime(START_DATE_FULL, "%d %B %Y")
    total_results = 0
    api_key_index = 0
    stop_execution = False

    while not stop_execution:
        for date_format in DATE_FORMATS:
            if date_format == "%d %b %Y":
                current_date = current_date_short
            else:
                current_date = current_date_full
            
            date_total_results = 0
            formatted_date = current_date.strftime(date_format)
            logging.info(f"Processing date: {formatted_date}")
            print(f"[INFO] Processing date: {formatted_date}")
            
            for query_template in QUERIES_TEMPLATE:
                for condition in CONDITIONS:
                    query = query_template.replace("{DATE}", formatted_date) + f' "{condition}"'
                    
                    retry = True
                    while retry:
                        result = process_query(query, API_KEYS[api_key_index])
                        
                        if result == "RATE_LIMIT":
                            api_key_index += 1
                            if api_key_index >= len(API_KEYS):
                                logging.error("All API keys have exceeded their rate limits or are forbidden. Stopping execution.")
                                print("[ERROR] All API keys have exceeded their rate limits or are forbidden. Stopping execution.")
                                stop_execution = True
                                retry = False
                                break  # Exit both the inner loops
                            logging.info(f"Switching to API key index: {api_key_index}")
                            print(f"[INFO] Switching to API key index: {api_key_index}")
                        else:
                            retry = False  # Exit the retry loop only if no rate limit error

                    if stop_execution:
                        break  # Break the outer loop if stopping

                    # Ensure result is a valid number before adding
                    if isinstance(result, int) and result > 0:
                        date_total_results += result
                    else:
                        logging.warning(f"Query returned no valid results for {formatted_date}.")
                        print(f"[WARN] Query returned no valid results for {formatted_date}.")

            if stop_execution:
                break  # Break the date_format loop if stopping

            total_results += date_total_results
            print(f"[INFO] Total results for {formatted_date}: {date_total_results}")
            # Can add break point here to start
            # Update the current date based on the format
            # For example: 
            # stop_execution = True
            # break
            # etc
            if date_format == "%d %b %Y":
                current_date_short -= timedelta(days=1)
            else:
                current_date_full -= timedelta(days=1)

        if stop_execution:
            break  # Exit the while loop if stopping

    logging.info(f"Total results fetched for all queries: {total_results}")
    print(f"[INFO] Total results fetched for all queries: {total_results}")


if __name__ == "__main__":
    main()
