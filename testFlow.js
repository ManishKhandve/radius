const { handleMessage, clearSession } = require('./flow.js');

async function runTest() {
  const senderId = "12345@c.us";
  const fakeMsg = (text) => ({
    from: senderId,
    body: text,
    getContact: async () => ({ pushname: "TestUser" })
  });

  console.log("--- TEST 1: Welcome ---");
  let res = await handleMessage(fakeMsg("hi"));
  console.log(res);

  console.log("\n--- TEST 2: Select Language (English) ---");
  res = await handleMessage(fakeMsg("1"));
  console.log(res);

  console.log("\n--- TEST 3: Select Cleaning ---");
  res = await handleMessage(fakeMsg("1"));
  console.log(res);

  console.log("\n--- TEST 4: Select Flat Deep Cleaning ---");
  res = await handleMessage(fakeMsg("1"));
  console.log(res);

  console.log("\n--- TEST 5: Select Furnished ---");
  res = await handleMessage(fakeMsg("1"));
  console.log(res);

  console.log("\n--- TEST 6: Select 1 BHK ---");
  res = await handleMessage(fakeMsg("1"));
  console.log(res);

  console.log("\n--- TEST 7: Continue ---");
  res = await handleMessage(fakeMsg("1"));
  console.log(res);

  console.log("\n--- TEST 8: Enter Location ---");
  res = await handleMessage(fakeMsg("Pune"));
  console.log(res);

  console.log("\n--- TEST 9: Select Today ---");
  res = await handleMessage(fakeMsg("1"));
  console.log(res);

  // Restart
  clearSession(senderId);

  console.log("\n--- TEST 10: Call Support ---");
  await handleMessage(fakeMsg("hi"));
  await handleMessage(fakeMsg("1")); // English
  res = await handleMessage(fakeMsg("0"));
  console.log(res);
}

runTest().catch(console.error);
