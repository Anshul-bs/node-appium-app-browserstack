var assert = require('assert');
const fs = require('fs');
const path = require('path');
const { Builder, By, until } = require('selenium-webdriver');

// Build a BrowserStack App Automate session instead of local Appium
var buildDriver = function() {
  const caps = {
    platformName: 'android',
    // App under test. The BrowserStack Node SDK will populate env vars from browserstack.yml
    'appium:app': process.env.BROWSERSTACK_APP_ID || 'bs://sample.app',
    'bstack:options': {
      userName: "anshulgoyal_0FToz5",
      accessKey: "mhDcLrDXUT1yRSpW78uS",
      deviceName: 'Google Pixel 7 Pro',
      osVersion: '13.0',
      projectName: process.env.BROWSERSTACK_PROJECT || 'bstack-test-ai',
      buildName: process.env.BROWSERSTACK_BUILD || 'bstack-test-ai',
      sessionName: 'Wikipedia search'
    }
  };

  return new Builder()
    .usingServer('https://hub.browserstack.com/wd/hub')
    .withCapabilities(caps)
    .build();
};

async function bstackSampleTest () {
  let driver =  buildDriver();
  try {
    await driver.wait(
      until.elementLocated(
        By.xpath(
          '/hierarchy/android.widget.FrameLayout/android.widget.LinearLayout/android.widget.FrameLayout/android.widget.FrameLayout/android.widget.FrameLayout/android.widget.FrameLayout/android.widget.FrameLayout/android.widget.FrameLayout/android.widget.LinearLayout/android.view.ViewGroup/android.support.v4.view.ViewPager/android.view.ViewGroup/android.widget.FrameLayout/android.support.v7.widget.RecyclerView/android.widget.FrameLayout[1]/android.widget.LinearLayout/android.widget.TextView'
        )
      ), 30000
    ).click();

    var insertTextSelector = await driver.wait(
      until.elementLocated(
        By.xpath(
          '/hierarchy/android.widget.FrameLayout/android.widget.LinearLayout/android.widget.FrameLayout/android.widget.FrameLayout/android.widget.FrameLayout/android.widget.FrameLayout/android.widget.FrameLayout/android.widget.FrameLayout/android.widget.LinearLayout[1]/android.widget.FrameLayout[1]/android.view.ViewGroup/android.widget.LinearLayout/android.support.v7.widget.LinearLayoutCompat/android.widget.LinearLayout/android.widget.LinearLayout/android.widget.LinearLayout/android.widget.AutoCompleteTextView'
        ), 30000
      )
    );
    await insertTextSelector.sendKeys('BrowserStack');
    await driver.sleep(5000);

  // Example screenshot after typing
  try { await takeScreenshot(driver, 'after-search-input'); } catch (e) {}

    var allProductsName = await driver.findElements(
      By.xpath(
        '/hierarchy/android.widget.FrameLayout/android.widget.LinearLayout/android.widget.FrameLayout/android.widget.FrameLayout/android.widget.FrameLayout/android.widget.FrameLayout/android.widget.FrameLayout/android.widget.FrameLayout/android.widget.LinearLayout[1]/android.widget.FrameLayout[2]/android.widget.FrameLayout/android.widget.LinearLayout/android.widget.ListView/android.widget.LinearLayout'
      )
    );

    assert(allProductsName.length > 0);
    await driver.executeScript(
      'browserstack_executor: {"action": "setSessionStatus", "arguments": {"status":"passed","reason": "Search in Wikipedia done correctly"}}'
    );
  } catch (e) {
  // Capture a screenshot on failure for debugging
  try { await takeScreenshot(driver, 'error'); } catch (_) {}
    await driver.executeScript(
      'browserstack_executor: {"action": "setSessionStatus", "arguments": {"status":"failed","reason": "Some elements failed to load"}}'
    );
  } finally {
    if (driver) {
      await driver.quit();
    }
  }
}

bstackSampleTest();
