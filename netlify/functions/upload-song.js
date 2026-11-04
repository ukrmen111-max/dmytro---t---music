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
    const coverBase64 = String(data.coverBase64 || "");
    const coverType = String(data.coverType || "").toLowerCase();

    if (!title || !fileBase64) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "Вкажіть назву та виберіть MP3"
        })
      };
    }

    const content = Buffer.from(fileBase64, "base64");

    if (content.length < 100 || content.length > 4 * 1024 * 1024) {
      return {
        statusCode: 413,
        headers,
        body: JSON.stringify({
          error: "MP3 має бути не більшим за 4 МБ"
        })
      };
    }

    const isMp3 =
      content.subarray(0, 3).toString() === "ID3" ||
      (content[0] === 0xff && (content[1] & 0xe0) === 0xe0);

    if (!isMp3) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "Це не схоже на MP3-файл"
        })
      };
    }

    const api = `https://api.github.com/repos/${OWNER}/${REPO}/contents/`;

    const authHeaders = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };

    const uploadFile = async (path, buffer, message) => {
      const response = await fetch(api + path, {
        method: "PUT",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message,
          content: buffer.toString("base64"),
          branch: BRANCH
        })
      });

      if (!response.ok) {
        throw new Error(`GitHub ${response.status}: ${await response.text()}`);
      }
    };

    const songPath = `media/song-${Date.now()}.mp3`;

    await uploadFile(
      songPath,
      content,
      `Додано пісню: ${title}`
    );

    let coverPath = "";

    if (coverBase64) {
      const extensions = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp"
      };

      const extension = extensions[coverType];

      if (!extension) {
        throw new Error("Обкладинка має бути JPG, PNG або WEBP");
      }

      const cover = Buffer.from(coverBase64, "base64");

      if (cover.length > 1024 * 1024) {
        throw new Error("Обкладинка має бути не більшою за 1 МБ");
      }

      coverPath = `media/cover-${Date.now()}.${extension}`;

      await uploadFile(
        coverPath,
        cover,
        `Додано обкладинку: ${title}`
      );
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
      throw new Error("Не вдалося прочитати каталог пісень");
    }

    songs.push({
      title,
      file: songPath,
      path: songPath,
      cover: coverPath
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
      throw new Error("Пісню завантажено, але каталог не оновився");
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        title,
        file: songPath,
        cover: coverPath
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message
      })
    };
  }
};
