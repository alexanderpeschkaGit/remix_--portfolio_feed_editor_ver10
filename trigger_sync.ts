import fetch from "node-fetch";

async function triggerSync() {
  const baseUrl = "http://localhost:3000";
  console.log("Triggering sync...");
  const startRes = await fetch(`${baseUrl}/api/sync/highres`, { method: 'POST' });
  if (!startRes.ok) {
    console.error("Failed to start sync:", await startRes.text());
    return;
  }
  console.log("Sync started.");

  const poll = setInterval(async () => {
    const statusRes = await fetch(`${baseUrl}/api/sync/status`);
    if (!statusRes.ok) {
      console.error("Failed to get status.");
      return;
    }
    const status = await statusRes.json() as any;
    console.log("\n--- Sync Status ---");
    console.log("Running:", status.running);
    console.log("Done:", status.done);
    console.log("Error:", status.error);
    console.log("Logs:");
    status.logs.forEach((log: string) => console.log(`  ${log}`));

    if (status.done || status.error) {
      clearInterval(poll);
      console.log("\nSync finished.");
    }
  }, 2000);
}

triggerSync();
