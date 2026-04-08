fetch('https://corsproxy.io/?https://google.com')
  .then(res => res.text())
  .then(data => console.log("CORS PROXY OK"))
  .catch(err => console.error("CORS PROXY ERROR", err));
