def load_api_keys(file_path):
    with open(file_path, 'r') as file:
        return [line.strip() for line in file if line.strip()]
    
API_KEYS = load_api_keys('api_keys.txt')

print(len(API_KEYS))