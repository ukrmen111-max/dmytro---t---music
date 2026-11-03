const OWNER = "ukrmen111";
const REPO = "dmytro---t---music";
const BRANCH = "main";

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json"
  };

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
    const fileBase64 = String(data.fileBase64 || "");

    if (!title || !fileBase64) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Вкажіть назву та виберіть MP3" })
      };
    }

    const content = Buffer.from(fileBase64, "base64");

    if (
      content.length < 100 ||
      content.length > 3 * 1024 * 1024
    ) {
      return {
        statusCode: 413,
        headers,
        body: JSON.stringify({ error: "MP3 має бути не більшим за 3 МБ" })
      };
    }

    const isMp3 =
      content.subarray(0, 3).toString() === "ID3" ||
      (content[0] === 0xff && (content[1] & 0xe0) === 0xe0);

    if (!isMp3) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Це не схоже на MP3-файл" })
      };
    }

    const api = `https://api.github.com/repos/${OWNER}/${REPO}/contents/`;
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };

    const path = `media/song-${Date.now()}.mp3`;

    const upload = await fetch(api + path, {
      method: "PUT",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: `Додано пісню: ${title}`,
        content: content.toString("base64"),
        branch: BRANCH
      })
    });

    if (!upload.ok) {
  const details = await upload.text();
  throw new Error(
    `GitHub ${upload.status}: ${details}`
  );
}
    }

    const catalogResponse = await fetch(api + "songs.json", {
      headers: authHeaders
    });

    let songs = [];
    let sha;

    if (catalogResponse.ok) {
      const catalog = await catalogResponse.json();
      sha = catalog.sha;
      songs = JSON.parse(
        Buffer.from(catalog.content, "base64").toString("utf8")
      );
    } else if (catalogResponse.status !== 404) {
      throw new Error("Не вдалося прочитати каталог");
    } else {
      songs = [{
        title: "Святе військо",
        path: "media/Святе військо.mp3"
      }];
    }

    songs.push({
      title,
      path
    });

    const saveCatalog = await fetch(api + "songs.json", {
      method: "PUT",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: `Оновлено каталог: ${title}`,
        content: Buffer.from(
          JSON.stringify(songs, null, 2)
        ).toString("base64"),
        branch: BRANCH,
        ...(sha ? { sha } : {})
      })
    });

    if (!saveCatalog.ok) {
      throw new Error("MP3 завантажено, але каталог не оновився");
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        title
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
