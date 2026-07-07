export function getMaintenancePageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Under Maintenance — ClawSimple</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #f8f5f0;
    color: #171512;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 24px;
  }
  .card {
    background: #fff;
    border: 1px solid #e0dcd7;
    border-radius: 16px;
    padding: 48px 40px;
    max-width: 480px;
    width: 100%;
    text-align: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .icon {
    font-size: 48px;
    margin-bottom: 24px;
    line-height: 1;
  }
  h1 {
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.01em;
    margin-bottom: 12px;
  }
  p {
    font-size: 15px;
    line-height: 1.6;
    color: #6b6763;
    margin-bottom: 8px;
  }
  .footer {
    margin-top: 28px;
    font-size: 13px;
    color: #a09b95;
  }
</style>
</head>
<body>
<div class="card">
  <div class="icon">⚙️</div>
  <h1>We'll be right back</h1>
  <p>ClawSimple is undergoing scheduled maintenance. Your bots and servers are still running — we're just updating the dashboard.</p>
  <p>This usually takes less than 5 minutes.</p>
  <div class="footer">ClawSimple</div>
</div>
</body>
</html>`;
}
