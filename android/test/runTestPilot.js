const { Builder } = require('selenium-webdriver');
const { AISDK } = require("@browserstack/ai-sdk-node");
const path = require('path');
const {
  waitSeconds,
} = require("@browserstack/ai-sdk-node/lib/nltosteps/utils");
const {
  NL2StepsNxt,
  PlaywrightFramework,
  AppiumFramework,
  BrowserAgent,
  AppiumDriver,
  createTestPilotClient

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
// const TCG_DOMAIN = "https://tcg.bsstag.com";

const limit = pLimit(5);

// Build and open an Appium session on BrowserStack using capabilities
// Usage: const driver = await openAppWithCaps({ sessionName: 'My session' });
async function openAppWithCaps(options = {}) {
  const {
    platformName = options.platformName || 'android',
    app = options.app || process.env.BROWSERSTACK_APP_ID || 'bs://931a3117fabe14849b96e623205bcedfe499e136',
    userName = options.userName || process.env.BROWSERSTACK_USERNAME || 'ankitaugale_FnUWEP',
    accessKey = options.accessKey || process.env.BROWSERSTACK_ACCESS_KEY || 'CiZYpzAG5q5tzG4gweyQ',
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
  // Function to handle initial app setup (permissions and skip)
  async function handleInitialAppSetup(driver) {
    // Add wait and handle initial popups/permissions
    await driver.manage().setTimeouts({ implicit: 5000 });

    // Wait for app to load and handle "Do not allow" alert if present
    try {
      await driver.sleep(3000); // Wait for app to fully load
      
      // Handle permission alert - click "Do not allow"
      try {
        const dontAllowButton = await driver.findElement({ id: 'com.android.permissioncontroller:id/permission_deny_button' });
        await dontAllowButton.click();
        console.log('Clicked "Do not allow" on permission alert');
      } catch (e) {
        // Alert might not appear, continue
        console.log('No permission alert found or already handled');
      }
      
      // Wait a bit and then handle skip button
      await driver.sleep(2000);
      
      // Click skip button
      try {
        const skipButton = await driver.findElement({ xpath: "//android.widget.Button[contains(@text, 'Skip') or contains(@text, 'SKIP')]" });
        await skipButton.click();
        console.log('Clicked Skip button');
      } catch (e) {
        // Skip button might not be present
        console.log('No skip button found or already handled');
      }
      
    } catch (error) {
      console.log('Error handling initial app setup:', error);
    }
  } 
// Function to load the JSONL file
// function loadDataset(filename) {
//   const dataset = [];
//   const lines = fs.readFileSync(filename, 'utf-8').split('\n');
//   lines.forEach((line) => {
//     if (line.trim()) {
//       dataset.push(JSON.parse(line));
//     }
//   });
//   return dataset;
// }

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

  
  const { ques, web, id } = caseData; // Extract from dataset
  const reqId = "benchmark-" + uuidv4();
  log("running case", reqId, caseData, `retries: ${retries}`);
  /** @type {{metrics: {calculatedTotal: number, actualTotal: number, metrics: {name: string, value: number}[], buckets: Map<string, { sum: number, percentage: number }>}, reqId: string}} */
  const response = {
    reqId,
    case: caseData,
    metrics: null,
  };
  const frameworkObj = new AppiumDriver(driver);

  const objective = ques;
  console.log(`Testing for: ${objective}`);
  const url = web;
  const saveDir = reqId;
  let annotatedId = 1;
  const clientOptions = {
    source: 'aiproxy:native:app',
    auth: {
      authMethod: 'basicAuth',
      authKey: 'cm9vdDpwYXNzd29yZA==',
    },
    userInfo: {
      userId: 1768,
      groupId: 5119,
    },
    sessionId: 'session-id-34io234u83or',
    tcgEndpoint: `http://localhost:3000`,
    frameworkObj,
  };

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
    const testPilot = await createTestPilotClient(clientOptions);
    console.log('is feature enabled:', testPilot.isFeatureEnabled);
    const out = await testPilot.start({
      id: reqId,
      objective: ques,
      saveDir: saveDir,
      labelled: false,
      frameworkObj,
      memoryOptions: {maxScreenshot:2},
      waitCallback: async (waitAction) => {
        console.log(
          `${waitAction.type}::: ${waitAction.request.variant}-${waitAction.request.thought}`
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
      //authMethod: getAuthToken,
      waitAfterActions: true,
      supportedActions: [
        'mouse:click',
        'mouse:double_click',
        // 'mouse:right_click',
        // 'mouse:move',
        'mouse:scroll',
        'keyboard:type',
        // 'browser:tab:new',
        // 'browser:tab:switch',
        // 'browser:nav',
        // 'mouse:drag',
        'keyboard:enter',
        'keyboard:tab',
        'keyboard:backspace',
        // 'keyboard:select_all',
        // 'native_element:set_value',
        'wait',
        'validator:text',
        'validator:visual',
        'validator:element',
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
    const metricsData = {
      ...response,
      apiTimesCount: response.apiTimes ? response.apiTimes.length : 0,
      buildLink: ""
    };
    fs.writeFileSync(`${outputDir}/metrics.json`, JSON.stringify(metricsData), null, 2, 'utf-8');
  }
}


async function runWithDelay() {
  let driver;
  try {
    driver = await openAppWithCaps();
    await handleInitialAppSetup(driver);
    //AISDK.configure({ domain: TCG_DOMAIN, platform: "app" });
    
    // Sleep 10s for initial setup
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    const dataset = JSON.parse(fs.readFileSync('testbed_input.json', 'utf-8'));
    
    // Run each test case with 1 minute delay between them
      await runTestCase({id: 35, ques: "Click on the 'more' icon on the home page and then click 'log in' from the bottomsheet and then type 'username 123' in the field and then simulate Backspace key presses to remove all characters one by one until the field is empty", web: ""}, driver);
  } catch (error) {
    console.log(error);
  } finally {
    if (driver) {
      console.log("we are here...");
      await driver.executeScript(
        'browserstack_executor: {"action": "setSessionStatus", "arguments": {"status":"passed","reason": "Test cases completed"}}'
      );
      try { await driver.quit(); } catch (_) {}
    }
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
  await runWithDelay();
})();
