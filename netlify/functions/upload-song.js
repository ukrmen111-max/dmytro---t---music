const { Buffer } = require("buffer");

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  const password = process.env.ADMIN_PASSWORD;
  const token = process.env.GITHUB_TOKEN;

  if (!password || !token) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Server is not configured" })
    };
  }

  try {
    const data = JSON.parse(event.body || "{}");

    if (data.password !== password) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "Неправильний пароль" })
      };
    }

    const title = String(data.title || "").trim();
    const fileName = String(data.fileName || "");
    const fileBase64 = String(data.fileBase64 || "");

    if (!title || !/^[a-zA-Z0-9.-]+\.mp3$/i.test(fileName) || !fileBase64) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Перевір назву та MP3-файл" })
      };
    }

    const content = Buffer.from(fileBase64, "base64");

    if (content.length > 3 * 1024 * 1024) {
      return {
        statusCode: 413,
        headers,
        body: JSON.stringify({ error: "Файл завеликий. Максимум 8 МБ." })
      };
    }

    const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const path = `media/${Date.now()}-${safeName}`;
    const url = `https://api.github.com/repos/ukrmen111/dmytro---t---music/contents/${path}`;

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify({
        message: `Додано пісню: ${title}`,
        content: content.toString("base64"),
        branch: "main"
      })
    });

    if (!response.ok) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: "GitHub не прийняв файл" })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        title,
        path
      })
    };
  } catch (error) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Не вдалося обробити файл" })
    };
  }
};
