import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import gplay from "google-play-scraper";
import winston from "winston";
import os from "os";
import yargs from "yargs";
import chalk from "chalk";
import { hideBin } from "yargs/helpers";
import { exec } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define custom colors for each log level
const levelColors = {
  error: chalk.red,
  warn: chalk.yellow,
  info: chalk.blue,
  debug: chalk.green,
};

// Create a logger with different levels and a file transport for log rotation
const logger = winston.createLogger({
  level: "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      // Apply color based on the log level
      const color = levelColors[level] || ((text) => text);
      return `${timestamp} [${color(level.toUpperCase())}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: "logs/google-play-scraper.log",
      maxsize: 1024 * 1024 * 10,
      maxFiles: 5,
    }),
  ],
});

function runBatchZipClean() {
  exec('./batch_zip_clean.sh', { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => { // Increase buffer to 10MB
    if (error) {
      console.error(chalk.red(`Error executing script: ${error.message}`));
      return;
    }

    if (stderr) {
      console.error(chalk.red(`Error output: ${stderr}`));
      return;
    }

    console.log(chalk.green(`Script output: ${stdout}`));
  });
}

// Function to clean up the app result by removing unnecessary fields
function cleanAppResult(result) {
  return {
    title: result.title,
    maxInstalls: result.maxInstalls || 0,
    ratings: result.ratings || 0,
    reviews: result.reviews || 0,
    price: result.price || "Free",
    adSupported: result.adSupported || false,
    offersIAP: result.offersIAP || false,
    genre: result.genre || "Unknown",
    appId: result.appId,
    released: result.released || "N/A",
    updated: result.updated || "N/A",
    developer: result.developer || "Unknown",
    developerId: result.developerId,
    developerEmail: result.developerEmail || "N/A",
    developerWebsite: result.developerWebsite || "N/A",
    video: result.video ? "YES" : "NO",
  };
}

// Function to introduce a delay
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateUniqueId() {
  return Math.floor(Math.random() * Date.now());
}

// Ensure the specified file exists, or create it
function ensureFileExists(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "");
  }
}

// Function to handle retries with exponential backoff and log failed keywords, developer IDs, or app IDs
async function retry(
  fn,
  retries = 3,
  delayTime = 1000,
  taskDescription = "task",
  keyword = "",
  developerId = "",
  appId = ""
) {
  try {
    return await fn();
  } catch (error) {
    // Check if the error is a 404 Not Found
    if (error.message.includes('404')) {
      logger.warn(
        `Skipping retry for ${taskDescription} due to 404 error (App not found): ${appId}`
      );
      // Do not retry or log the app ID as a failure
      return null;
    }

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
        developerId,
        appId
      );
    } else {
      logger.error(
        `Max retries reached for ${taskDescription}. Moving to the next item.`
      );

      // Log the failed keyword, developer ID, or app ID to respective files
      if (keyword) {
        logFailure("failed_keywords_GP.txt", keyword);
      }

      if (developerId) {
        logFailure("failed_developers_GP.txt", developerId);
      }

      if (appId) {
        logFailure("failed_appids_GP.txt", appId);
      }

      throw error;
    }
  }
}

// Helper function to log failures
function logFailure(fileName, id) {
  const filePath = path.join(__dirname, fileName);
  ensureFileExists(filePath);
  let failedIds = new Set(
    fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean)
  );
  failedIds.add(id);
  fs.writeFileSync(filePath, Array.from(failedIds).join("\n") + "\n");
  logger.warn(`Logged failed ID: ${id} to ${filePath}`);
}

// Function to process app details and save results to individual files
async function processAppDetails(appId) {
  try {
    const appDetails = await retry(
      () => gplay.app({ appId }),
      3,
      1000,
      `fetching detailed data for appId: ${appId}`,
      "",
      "",
      appId
    );

    if (!appDetails) {
      logger.warn(`App details not found for appId: ${appId}. Skipping.`);
      return null; // Return early if no app details are found
    }

    const cleanedResult = cleanAppResult(appDetails);
    const resultsDirPath = path.join(__dirname, "apps");

    if (!fs.existsSync(resultsDirPath)) {
      logger.debug(`Creating apps directory: ${resultsDirPath}`);
      fs.mkdirSync(resultsDirPath, { recursive: true });
    }

    const fileName = `${cleanedResult.appId}.txt`;
    const filePath = path.join(resultsDirPath, fileName);

    fs.writeFileSync(filePath, JSON.stringify(cleanedResult, null, 2));
    logger.debug(
      `Saved detailed result for app: ${cleanedResult.appId} to ${filePath}`
    );

    return cleanedResult.developer;
  } catch (error) {
    logger.error(`Error processing appId: ${appId}`, error);
    throw error;
  }
}

// Function to process a single bundle ID and its associated developer
async function processBundleId(appId) {
  logger.debug(`Starting processing for appId: ${appId}`);
  try {
    const developer = await processAppDetails(appId);
    if (developer) {
      await processDevelopers(new Set([developer]));
    }
  } catch (error) {
    logger.error(`Error processing appId: ${appId}`, error);
  }
  logger.debug(`Finished processing for appId: ${appId}`);
}

// Function to process developer data
async function processDevelopers(developerNames) {
  logger.debug("Starting processing of developer data");

  for (const developerName of developerNames) {
    try {
      const devResults = await retry(
        () => gplay.developer({ devId: developerName }),
        3,
        1000,
        `fetching data for developer: ${developerName}`,
        "",
        developerName,
        ""
      );

      if (!devResults || devResults.length === 0) {
        logger.debug(`No apps found for developer: ${developerName}`);
        continue;
      }

      for (const app of devResults) {
        await processAppDetails(app.appId);
      }
    } catch (devError) {
      logger.error(
        `Error fetching data for developer: ${developerName}`,
        devError
      );
    }
  }

  logger.debug("Finished processing all developers");
}

// Function to process bundle IDs concurrently
async function processBundleIdsFromFile(
  filePath,
  concurrency = os.cpus().length,
  bundleIdDelay = 0
) {
  try {
    const data = fs.readFileSync(filePath, "utf8");
    const bundleIds = data.split("\n").filter(Boolean);

    logger.info(
      `Starting to process ${bundleIds.length} bundle IDs with concurrency level: ${concurrency}`
    );

    const queue = bundleIds.map((appId) => async () => {
      await processBundleId(appId.trim());
      await delay(bundleIdDelay);
    });

    const activePromises = [];

    while (queue.length > 0 || activePromises.length > 0) {
      if (activePromises.length < concurrency && queue.length > 0) {
        const task = queue.shift();
        const promise = task();
        activePromises.push(promise);
        promise.finally(() => {
          const index = activePromises.indexOf(promise);
          if (index !== -1) activePromises.splice(index, 1);
        });
      } else {
        await Promise.race(activePromises);
      }
    }

    logger.info(`Completed processing all bundle IDs.`);
    runBatchZipClean();

  } catch (error) {
    logger.error(`Error processing bundle IDs from file: ${error.message}`);
  }
}

// Function to process a single keyword
async function processKeyword(keyword) {
  logger.debug(`Starting processing for keyword: ${keyword}`);
  try {
    const initialResults = await retry(
      () => gplay.search({ term: keyword, num: 30 }),
      3,
      1000,
      `searching apps for keyword: ${keyword}`,
      keyword
    );

    if (!initialResults || initialResults.length === 0) {
      logger.debug(`No results found for keyword: ${keyword}`);
      return;
    }

    const developers = new Set();
    const appIds = initialResults.map((app) => app.appId);

    for (const appId of appIds) {
      const developer = await processAppDetails(appId);
      if (developer) {
        developers.add(developer);
      }
    }

    await processDevelopers(developers);
  } catch (error) {
    logger.error(`Error processing keyword: ${keyword}`, error);
  }

  logger.debug(`Finished processing for keyword: ${keyword}`);
}

// Function to process keywords concurrently
async function processKeywordsFromFile(
  filePath,
  concurrency = os.cpus().length,
  keywordDelay = 0
) {
  try {
    const data = fs.readFileSync(filePath, "utf8");
    const keywords = data.split("\n").filter(Boolean);

    logger.info(
      `Starting to process ${keywords.length} keywords with concurrency level: ${concurrency}`
    );

    const queue = keywords.map((keyword) => async () => {
      await processKeyword(keyword.trim());
      await delay(keywordDelay);
    });

    const activePromises = [];

    while (queue.length > 0 || activePromises.length > 0) {
      if (activePromises.length < concurrency && queue.length > 0) {
        const task = queue.shift();
        const promise = task();
        activePromises.push(promise);
        promise.finally(() => {
          const index = activePromises.indexOf(promise);
          if (index !== -1) activePromises.splice(index, 1);
        });
      } else {
        await Promise.race(activePromises);
      }
    }

    logger.info(`Completed processing all keywords.`);
  } catch (error) {
    logger.error(`Error processing keywords from file: ${error.message}`);
  }
}

// Function to process developers from a file concurrently
async function processDevelopersFromFile(
  filePath,
  concurrency = os.cpus().length,
  developerDelay = 0
) {
  try {
    const data = fs.readFileSync(filePath, "utf8");
    const developers = data.split("\n").filter(Boolean);

    logger.info(
      `Starting to process ${developers.length} developers with concurrency level: ${concurrency}`
    );

    const queue = developers.map((developerName) => async () => {
      await processDevelopers(new Set([developerName.trim()]));
      await delay(developerDelay);
    });

    const activePromises = [];

    while (queue.length > 0 || activePromises.length > 0) {
      if (activePromises.length < concurrency && queue.length > 0) {
        const task = queue.shift();
        const promise = task();
        activePromises.push(promise);
        promise.finally(() => {
          const index = activePromises.indexOf(promise);
          if (index !== -1) activePromises.splice(index, 1);
        });
      } else {
        await Promise.race(activePromises);
      }
    }

    logger.info(`Completed processing all developers.`);
  } catch (error) {
    logger.error(`Error processing developers from file: ${error.message}`);
  }
}

// Command-line argument parsing
const argv = yargs(hideBin(process.argv))
  .option("keywords", {
    alias: "k",
    description: "Process keywords from a file",
    type: "boolean",
  })
  .option("developers", {
    alias: "d",
    description: "Process developers from a file",
    type: "boolean",
  })
  .option("bundleIds", {
    alias: "b",
    description: "Process bundle IDs from a file",
    type: "boolean",
  })
  .check((argv) => {
    if (argv.keywords || argv.developers || argv.bundleIds) {
      return true;
    }
    throw new Error("Please provide at least one option to proceed");
  })
  .help()
  .alias("help", "h").argv;

// Main entry point
(async () => {
  const concurrencyLevel = os.cpus().length;
  const processingDelay = 1000;

  try {
    if (argv.keywords) {
      const keywordsFilePath = path.join(__dirname, "keywords.txt");
      await processKeywordsFromFile(
        keywordsFilePath,
        concurrencyLevel,
        processingDelay
      );
    }

    if (argv.developers) {
      const developersFilePath = path.join(__dirname, "developers_GP.txt");
      await processDevelopersFromFile(
        developersFilePath,
        concurrencyLevel,
        processingDelay
      );
    }

    if (argv.bundleIds) {
      const bundleIdsFilePath = path.join(__dirname, "bundleIds.txt");
      await processBundleIdsFromFile(
        bundleIdsFilePath,
        concurrencyLevel,
        processingDelay
      );
    }
  } catch (error) {
    logger.error(`Unexpected error: ${error.message}`);
  }
})();
