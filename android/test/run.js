const { Builder } = require('selenium-webdriver');
const { AISDK } = require("@browserstack/ai-sdk-node");
const path = require('path');
const {
  waitSeconds,
} = require("@browserstack/ai-sdk-node/lib/nltosteps/utils");
const {
  NL2StepsNxt,
  PlaywrightFramework,
  AppiumFramework
} = require("@browserstack/ai-sdk-node/lib");
const {
  setLoggerBase,
} = require("@browserstack/ai-sdk-node/lib/logger/index.js");
const { v4: uuidv4 } = require("uuid");
const { readFileSync } = require("fs");
const axios = require("axios");
const fs = require("fs");
// const {
//   transformMetrics,
//   writeResultsToExcel,
// } = require("./benchmark-utils.js");
const {
  loadScript,
} = require("@browserstack/ai-sdk-node/lib/nltosteps/connectors/support/script-loader");
const pLimit = require("p-limit");
const dotenv = require('dotenv');
dotenv.config({});
const { createCanvas, loadImage } = require("canvas");

const TCG_DOMAIN = "http://localhost:3000";

const limit = pLimit(5);

// Build and open an Appium session on BrowserStack using capabilities
// Usage: const driver = await openAppWithCaps({ sessionName: 'My session' });
async function openAppWithCaps(options = {}) {
  const {
    platformName = options.platformName || 'android',
    app = options.app || process.env.BROWSERSTACK_APP_ID || 'bs://sample.app',
    userName = options.userName || process.env.BROWSERSTACK_USERNAME || 'anshulgoyal_0FToz5',
    accessKey = options.accessKey || process.env.BROWSERSTACK_ACCESS_KEY || 'mhDcLrDXUT1yRSpW78uS',
    deviceName = options.deviceName || 'Google Pixel 7 Pro',
    osVersion = options.osVersion || '13.0',
    projectName = options.projectName || process.env.BROWSERSTACK_PROJECT || 'bstack-test-ai',
    buildName = options.buildName || process.env.BROWSERSTACK_BUILD || 'bstack-test-ai',
    sessionName = options.sessionName || 'Sample App session',
    server = options.server || process.env.BROWSERSTACK_SERVER || 'https://hub.browserstack.com/wd/hub'
  } = options;

  const caps = {
    platformName,
    'appium:app': app,
    'bstack:options': {
      userName,
      accessKey,
      deviceName,
      osVersion,
      projectName,
      buildName,
      sessionName,
    },
  };

  const driver = await new Builder()
    .usingServer(server)
    .withCapabilities(caps)
    .build();

  return driver;
}
// const dataset = [
//   {
//     web_name: "Allrecipes",
//     id: "Allrecipes--0",
//     ques: "Provide a recipe for vegetarian lasagna with more than 100 reviews and a rating of at least 4.5 stars suitable for 6 people.",
//     web: "https://www.allrecipes.com/",
//   },
//   // {
//   //   web_name: "Cambridge Dictionary",
//   //   id: "Testing--0",
//   //   ques: 'Look up the pronunciation and definition of the word "sustainability" on the Cambridge Dictionary.',
//   //   web: "https://dictionary.cambridge.org/",
//   // },
//   // {
//   //   web_name: "Allrecipes",
//   //   id: "Allrecipes--1",
//   //   ques: "Find a recipe for a vegetarian lasagna.",
//   //   web: "https://www.allrecipes.com/",
//   // },
//   // {
//   //   web_name: "Allrecipes",
//   //   id: "Allrecipes--3",
//   //   ques: "Locate a recipe for vegan chocolate chip cookies with over 60 reviews and a rating of at least 4.5 stars on Allrecipes.",
//   //   web: "https://www.allrecipes.com/",
//   // },
//   // Add more cases here
// ];

// Function to load the JSONL file
function loadDataset(filename) {
  const dataset = [];
  const lines = fs.readFileSync(filename, 'utf-8').split('\n');
  lines.forEach((line) => {
    if (line.trim()) {
      dataset.push(JSON.parse(line));
    }
  });
  return dataset;
}

// Load the dataset from the JSONL file
// const dataset = loadDataset('WebVoyager_Debug.jsonl');
function log(...data) {
  const logStrings = [];

  for (const d of data) {
    if (!d) continue;
    if (d instanceof Error) {
      logStrings.push(d.stack);
      continue;
    }

    if (typeof d === "object") {
      logStrings.push(JSON.stringify(d, null, "  "));
      continue;
    }

    logStrings.push(d + "");
  }

  console.log(logStrings.join(" "));
}

async function getAuthToken() {
  let data = JSON.stringify({
    data: {
      userId: 1762,
      groupId: 2,
    },
  });

  let config = {
    method: "post",
    url: `${TCG_DOMAIN}/auth/generate-token`,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Basic " + "cm9vdDpwYXNzd29yZA==",
    },
    data: data,
  };

  const response = await axios.request(config);
  return response.data.data.jwt_token;
}

function alreadyProcessedDir(prefix) {
  try {
    const files = fs.readdirSync('./results');
    const fndDir = files.find(file => {
      const fullPath = path.join('./results', file);
      return fs.statSync(fullPath).isDirectory() && file.startsWith(prefix);
    });

    return fndDir;
  } catch (error) {
    return null;
  }
}

async function annotateImage(inputPath, action) {
  try {
      const outputPath = inputPath;
      const img = await loadImage(inputPath);
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext("2d");
      const x = action.x;
      const y = action.y;
      let text = action.action;
      if (action.action === "textValidate" && action.operator) {
        text += ", " + action.operator + ", " + action.text
      }

      ctx.drawImage(img, 0, 0);

      ctx.strokeStyle = "red";
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "red";
      ctx.font = "12px Arial";
      ctx.fillText(text, x -30 , y - 10);

      const buffer = canvas.toBuffer("image/png");
      fs.writeFileSync(outputPath, buffer);

      console.log(`Annotated image saved as: ${outputPath}`);
  } catch (error) {
      console.error("Error processing image:", error);
  }
}

async function runTestCase(caseData, driver, retries = 0) {
  if (!fs.existsSync('./results')) {
    fs.mkdirSync('./results', { recursive: true })
  }

  const processedDir = alreadyProcessedDir(caseData.id);
  // if (processedDir) {
  //   console.log("checking if already processed");
  //   const metricFileLocation = `./results/${processedDir}/metrics.json`;
  //   const objectiveDataJson = `./results/${processedDir}/objectiveData.json`;

  //   if (fs.existsSync(objectiveDataJson)) {
  //     if (fs.existsSync(metricFileLocation)) {
  //       return JSON.parse(fs.readFileSync(metricFileLocation).toString('utf-8'));
  //     } else {
  //       return undefined;
  //     }
  //   } else {
  //     fs.rmSync(`./results/${processedDir}`, { recursive: true, force: true });
  //   }
  // }

  // AISDK.configure({ domain: "http://localhost:3000/", platform: "desktop" });
  // const url = 'https://www.apple.com/in';
  // const objective = 'Buy an iPhone 15 with black color, 128 GB storage, no trade-in and applecare+ coverage';
  // const url = 'http://open.spotify.com/';
  // const objective = 'Navigate to jobs section and search for Product manager position.';
  // for (const caseData of dataset) {
  const { ques, web, id } = caseData; // Extract from dataset
  const reqId = "benchmark-" + uuidv4();
  log("running case", reqId, caseData, `retries: ${retries}`);
  /** @type {{metrics: {calculatedTotal: number, actualTotal: number, metrics: {name: string, value: number}[], buckets: Map<string, { sum: number, percentage: number }>}, reqId: string}} */
  const response = {
    reqId,
    case: caseData,
    metrics: null,
  };

  const objective = ques;
  console.log(`Testing for: ${objective}`);
  const url = web;
  const saveDir = reqId;
  let annotatedId = 1;
  // const screen = { width: 1600, height: 900 };
  // const browser = await chromium.launch({ headless: false });
  // const context = await browser.newContext();
  // const page = await context.newPage({ viewport: screen });
  // log("page created");
  // const elementExtractorScript = await loadScript("elementExtractor");
  // // console.log('script - ', elementExtractorScript);
  // await context.addInitScript(elementExtractorScript);
  // await page.goto(url, { timeout: 120000, waitUntil: "domcontentloaded" });
  // const frameworkObj = new PlaywrightFramework(page, context, chromium);
  const frameworkObj = new AppiumFramework(driver);
  const varExample = {
    1: { name: "name", value: "gajikah385@notedns.com" },
    2: { name: "pwd", value: "strongpwd@123" },
  };

  const outputDir = `./results/${caseData.id}-${reqId}`;
  let outResponse, outError;
  const startTime = Date.now();

  function recordMetrics(r) {
    const totalTime = Date.now() - startTime;
    log("completed", caseData, "total time", totalTime);

    response.metrics = (r?.metrics);
    response.apiTimes = r?.apiTimes;
    response.metrics.actualTotal = totalTime;
  }

  try {
    setLoggerBase("console");
    const out = await NL2StepsNxt.start({
      id: reqId,
      objective: ques,
      saveDir: saveDir,
      labelled: false,
      frameworkObj,
      waitCallback: async (waitAction) => {
        console.log(
          `${waitAction.type}::: ${waitAction.request.action}-${waitAction.request.thought}`
        );
        if (waitAction.type === "INPUT") {
          await waitSeconds(2);
          console.log(
            `processing for input ${JSON.stringify(waitAction.request)}`
          );
          let varOut = "";
          for (const pi of waitAction.request.parsedInput) {
            if (pi.type === "variable") {
              varOut += varExample[pi.value].value;
            } else if (pi.type === "function") {
              // add and handle some functions
            } else if (pi.type === "text") {
              varOut += pi.value;
            } else if (pi.type === "ai") {
              varOut += pi.defaultValue;
            }
          }

          return varOut;
        } else if(waitAction.type === "BEFORE_STEP"){
          if(waitAction.screenshot && waitAction.debugMethod){
            waitAction.debugMethod({screenshot:waitAction.screenshot,requestId:waitAction.requestId,action:waitAction.action});
          }
          return true;
        } else {
          return true;
        }
      },
      authMethod: getAuthToken,
      waitAfterActions: true,
      supportedCustomActions: [
        "textValidate",
        "visualValidate",
        "elementValidate",
        "extractValue",
      ],
      variables: Object.keys(varExample).map((vId) => ({
        name: varExample[vId].name,
        id: vId,
      })),
      // variables: [{name: "xyz", id: 2}],
      functions: [],
      useGeneratorFunction: false,
      debug: true,
      debugMethod: async ({ screenshot, requestId, objective, response, action }) => {
        // Handle saving a screenshot if provided
        if (screenshot) {
          const imageContent = {
            type: 'base64',
            media_type: "image/png",
            data: screenshot, // Assuming `screenshot` contains base64-encoded image data
          };

          // Save the screenshot using the saveScreenshot function
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }

          let screenshotIndex = 1;
          while (fs.existsSync(path.join(outputDir, `${requestId}.png`))) {
            screenshotIndex++;
          }

          const imageBuffer = Buffer.from(imageContent.data[0], 'base64');
          let toAdd = (action?(':::'+99900 + annotatedId):"");
          if(action){
            annotatedId +=1;
          }
          const imageFilePath = path.join(outputDir, `${requestId + toAdd}.png`);

          fs.writeFileSync(imageFilePath, imageBuffer);
          if(action){
            await annotateImage(imageFilePath, action);
          }
        }

        // Handle saving the objective and response
        if (objective && response) {
          const jsonData = { requestId, objective, response };
          const jsonFilePath = path.join(outputDir, 'objectiveData.json');

          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }

          fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2), 'utf-8');
          console.log(`Objective and response saved to: ${jsonFilePath}`);
        }
      }
    });

    recordMetrics(out);
    console.log(`Test complete for ${objective}`, out);
    return response;
  } catch (error) {
    console.log(error);
    log("failed while processing objective", caseData, error);
    if (retries > 0) {
      return runTestCase(caseData, --retries);
    }

    recordMetrics(error);
    return response;
  } finally {
    const jsonFilePath = path.join(outputDir, 'objectiveData.json');
    if (!fs.existsSync(jsonFilePath)) {
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      fs.writeFileSync(jsonFilePath, JSON.stringify({ requestId: reqId, objective }, null, 2), 'utf-8');
    }

    // add metrics in all cases
    fs.writeFileSync(`${outputDir}/metrics.json`, JSON.stringify(response), 'utf-8');

    //await browser.close();
  }
}

async function run() {
  AISDK.configure({ domain: TCG_DOMAIN, platform: "desktop" });

  // Use p-limit to run test cases in parallel with the specified limit
  const results = [];
  const promises = dataset.map((caseData) =>
    limit(async () => {
      const result = await runTestCase(caseData);
      results.push(result);
    })
  );

  // Wait for all test cases to complete
  await Promise.all(promises);
  fs.writeFileSync('./results/final.json', JSON.stringify(results), 'utf-8');
}

(async () => {
  let driver;
  try {
    driver = await openAppWithCaps();
    AISDK.configure({ domain: TCG_DOMAIN, platform: "desktop" });

    await runTestCase({ id: 1, ques: "Click on options menu.", web: "" }, driver);
  } catch (error) {
    console.log(error);
  } finally {
    if (driver) {
       await driver.executeScript(
      'browserstack_executor: {"action": "setSessionStatus", "arguments": {"status":"passed","reason": "Search in Wikipedia done correctly"}}'
      );
      try { await driver.quit(); } catch (_) {}
    }
  }
})();
