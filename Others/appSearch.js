const fs = require("fs");
const path = require("path");
const store = require("app-store-scraper").memoized({ maxAge: 1000 * 60 * 5 });
const winston = require("winston");
const os = require("os");
let totalNumberOfApps = 0;

// Create a logger with different levels and a file transport for log rotation
const logger = winston.createLogger({
  level: "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: "logs/app-scraper.log",
      maxsize: 1024 * 1024 * 10,
      maxFiles: 5,
    }),
  ],
});

// Function to clean up the app result by removing unnecessary fields
function cleanAppResult(result) {
  return {
    title: result.title,
    id: result.id,
    appId: result.appId,
    primaryGenre: result.primaryGenre,
    released: result.released,
    updated: result.updated,
    price: result.price,
    reviews: result.reviews,
    developerId: result.developerId,
    developerWebsite: result.developerWebsite,
  };
}

// Function to introduce a delay
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Ensure the failed_developers.txt file exists, or create it
function ensureFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "");
  }
}

// Function to handle retries with exponential backoff and log failed keywords or developer IDs
async function retry(
  fn,
  retries = 3,
  delayTime = 1000,
  taskDescription = "task",
  keyword = "",
  developerId = ""
) {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0) {
      logger.warn(
        `Retrying ${taskDescription} after error: ${error.message}. Retries left: ${retries}`
      );
      await delay(delayTime);
      return retry(
        fn,
        retries - 1,
        delayTime * 2,
        taskDescription,
        keyword,
        developerId
      ); // Increase delay for the next attempt
    } else {
      logger.error(
        `Max retries reached for ${taskDescription}. Moving to the next item.`
      );

      // Log the failed keyword or developer ID to a file
      if (keyword) {
        const failedKeywordsFilePath = path.join(
          __dirname,
          "failed_keywords.txt"
        );
        fs.appendFileSync(failedKeywordsFilePath, `${keyword}\n`);
        logger.warn(
          `Logged failed keyword: ${keyword} to ${failedKeywordsFilePath}`
        );
      }

      if (developerId) {
        const failedDevelopersFilePath = path.join(
          __dirname,
          "failed_developers.txt"
        );
        ensureFileExists(failedDevelopersFilePath);
        let failedDeveloperIds = new Set(
          fs
            .readFileSync(failedDevelopersFilePath, "utf8")
            .split("\n")
            .filter(Boolean)
        );
        failedDeveloperIds.add(developerId);
        fs.writeFileSync(
          failedDevelopersFilePath,
          Array.from(failedDeveloperIds).join("\n") + "\n"
        );
        logger.warn(
          `Logged failed developer ID: ${developerId} to ${failedDevelopersFilePath}`
        );
      }

      throw error;
    }
  }
}

// Function to process a single keyword and save results to individual files
async function processKeyword(keyword) {
  let page = 1;
  let hasMoreResults = true;
  const developerIds = [];
  logger.debug(`Starting processing for keyword: ${keyword}`);

  while (page <= 4 && hasMoreResults) {
    logger.debug(`Processing page ${page} for keyword: ${keyword}`);
    try {
      const results = await retry(
        () => store.search({ term: keyword, num: 50, page }),
        3,
        1000,
        `searching apps for keyword: ${keyword} on page ${page}`,
        keyword
      );

      if (results.length === 0) {
        logger.debug(
          `No results found on page ${page} for keyword: ${keyword}`
        );
        hasMoreResults = false;
        break;
      }

      const resultsDirPath = path.join(__dirname, "apps");
      if (!fs.existsSync(resultsDirPath)) {
        logger.debug(`Creating apps directory: ${resultsDirPath}`);
        fs.mkdirSync(resultsDirPath, { recursive: true });
      }

      for (const result of results) {
        const cleanedResult = cleanAppResult(result);
        logger.debug(
          `Processing app: ${cleanedResult.appId} - ${cleanedResult.title}`
        );

        // Collect developer IDs
        if (!developerIds.includes(cleanedResult.developerId)) {
          developerIds.push(cleanedResult.developerId);
        }

        const fileName = `${cleanedResult.appId}.txt`;
        const filePath = path.join(resultsDirPath, fileName);

        // Write the cleaned app result to a file named after the appId
        fs.writeFileSync(filePath, JSON.stringify(cleanedResult, null, 2));
        logger.debug(
          `Saved result for app: ${cleanedResult.appId} to ${filePath}`
        );
      }

      logger.debug(`Completed processing page ${page} for keyword: ${keyword}`);
      page++;
    } catch (error) {
      logger.error(
        `Error processing page ${page} for keyword: ${keyword}`,
        error
      );
      hasMoreResults = false; // Stop processing further pages for this keyword
    }
  }

  // Process developers after processing the keyword
  await processDevelopers(developerIds);

  logger.debug(`Finished processing for keyword: ${keyword}`);
}

// Function to process developer data after each keyword is processed
async function processDevelopers(developerIds) {
  logger.debug("Starting processing of developer data");

  const devDirPath = path.join(__dirname, "developers");
  if (!fs.existsSync(devDirPath)) {
    logger.debug(`Creating developers directory: ${devDirPath}`);
    fs.mkdirSync(devDirPath, { recursive: true });
  }

  const resultsDirPath = path.join(__dirname, "apps");
  if (!fs.existsSync(resultsDirPath)) {
    logger.debug(`Creating apps directory: ${resultsDirPath}`);
    fs.mkdirSync(resultsDirPath, { recursive: true });
  }

  for (const developerId of developerIds) {
    try {
      await delay(1000);
      const devResults = await retry(
        () => store.developer({ devId: developerId }),
        3,
        1000,
        `fetching data for developerId: ${developerId}`,
        "",
        developerId
      );

      const developerName = devResults[0].developer;
      const developerData = {
        developerId: developerId,
        developer: developerName,
        numberOfApps: devResults.length,
      };

      totalNumberOfApps += devResults.length;

      const devFileName = `${developerId}.txt`;
      const devFilePath = path.join(devDirPath, devFileName);

      // Save the developer's data
      fs.writeFileSync(devFilePath, JSON.stringify(developerData, null, 2));
      logger.debug(
        `Saved developer data for ${developerName} (ID: ${developerId}) to ${devFilePath}`
      );

      // Save each app from this developer to the apps folder
      for (const app of devResults) {
        const cleanedApp = cleanAppResult(app);
        const appFileName = `${cleanedApp.appId}.txt`;
        const appFilePath = path.join(resultsDirPath, appFileName);

        fs.writeFileSync(appFilePath, JSON.stringify(cleanedApp, null, 2));
        logger.debug(
          `Saved result for developer's app: ${cleanedApp.appId} to ${appFilePath}`
        );
      }
    } catch (devError) {
      logger.error(
        `Error fetching data for developerId: ${developerId}`,
        devError
      );
    }
  }
  logger.debug("Finished processing all developers");
}

// Function to process keywords concurrently with a limit on concurrency
async function processKeywordsFromFile(
  filePath,
  concurrency = os.cpus().length,
  keywordDelay = 1000
) {
  try {
    const data = fs.readFileSync(filePath, "utf8");
    const keywords = data.split("\n").filter(Boolean); // Split by line and filter out empty lines

    logger.info(
      `Starting to process ${keywords.length} keywords with concurrency level: ${concurrency}`
    );

    // Process keywords concurrently with a limit
    const queue = keywords.map((keyword) => async () => {
      await processKeyword(keyword.trim());
      await delay(keywordDelay); // Delay between processing each keyword
    });

    const activePromises = [];

    while (queue.length > 0 || activePromises.length > 0) {
      if (activePromises.length < concurrency && queue.length > 0) {
        const task = queue.shift();
        const promise = task();
        activePromises.push(promise);

        promise.finally(() => {
          activePromises.splice(activePromises.indexOf(promise), 1);
        });
      } else {
        await Promise.race(activePromises);
      }
    }

    logger.info("Finished processing all keywords and developers.");
    logger.info(`Total apps from developers = ${totalNumberOfApps}`);
  } catch (err) {
    logger.error("Error reading file:", err);
  }
}

// Function to retry processing failed developer IDs
async function retryFailedDevelopers(filePath) {
  ensureFileExists(filePath);

  const developerIds = fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter(Boolean);

  if (developerIds.length === 0) {
    logger.info("No failed developer IDs to retry.");
    return;
  }

  logger.info(`Retrying ${developerIds.length} failed developer IDs.`);

  await processDevelopers(developerIds);
}

// Main function to handle command-line arguments and run the appropriate process
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    logger.error(
      "Insufficient arguments. Usage: node appsearch.js <input_file> <mode>"
    );
    process.exit(1);
  }

  const filePath = args[0];
  const mode = args[1];

  if (mode === "1") {
    // Process keywords
    await processKeywordsFromFile(filePath);
  } else if (mode === "2") {
    // Retry failed developer IDs
    await retryFailedDevelopers(filePath);
  } else {
    logger.error("Invalid mode. Use '1' for keywords or '2' for developers.");
    process.exit(1);
  }
}

// Graceful shutdown handling
process.on("SIGINT", () => {
  logger.info("Received SIGINT. Exiting...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM. Exiting...");
  process.exit(0);
});

// Run the main function
main();
