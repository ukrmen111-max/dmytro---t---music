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
    const coverType = String(data.coverType || "");

    if (!title || !fileBase64 || !coverBase64) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "Вкажіть назву, MP3 та обкладинку"
        })
      };
    }

    const content = Buffer.from(fileBase64, "base64");
    const cover = Buffer.from(coverBase64, "base64");

    if (
      content.length < 100 ||
      content.length > 4 * 1024 * 1024
    ) {
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
        body: JSON.stringify({ error: "Це не схоже на MP3-файл" })
      };
    }

    if (
      cover.length < 100 ||
      cover.length > 5 * 1024 * 1024
    ) {
      return {
        statusCode: 413,
        headers,
        body: JSON.stringify({
          error: "Обкладинка має бути не більшою за 5 МБ"
        })
      };
    }

    const formats = {
      "image/jpeg": {
        ext: "jpg",
        signature: cover.subarray(0, 3).toString("hex") === "ffd8ff"
      },
      "image/png": {
        ext: "png",
        signature: cover.subarray(0, 8).toString("hex") ===
          "89504e470d0a1a0a"
      },
      "image/webp": {
        ext: "webp",
        signature:
          cover.subarray(0, 4).toString() === "RIFF" &&
          cover.subarray(8, 12).toString() === "WEBP"
      }
    };

    const format = formats[coverType];

    if (!format || !format.signature) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "Обкладинка повинна бути JPG, PNG або WEBP"
        })
      };
    }

    const api =
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/`;

    const authHeaders = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };

    const timestamp = Date.now();

    const path = `media/song-${timestamp}.mp3`;
    const coverPath =
      `media/covers/cover-${timestamp}.${format.ext}`;

    // Завантажуємо MP3
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
      throw new Error(`Помилка завантаження MP3: ${upload.status}`);
    }

    // Завантажуємо обкладинку
    const coverUpload = await fetch(api + coverPath, {
      method: "PUT",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: `Додано обкладинку: ${title}`,
        content: cover.toString("base64"),
        branch: BRANCH
      })
    });

    if (!coverUpload.ok) {
      throw new Error(
        `MP3 завантажено, але обкладинка не завантажилась: ${coverUpload.status}`
      );
    }

    // Читаємо каталог пісень
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

    // Додаємо нову пісню та її обкладинку
    songs.push({
      title,
      path,
      cover: coverPath
    });

    // Зберігаємо каталог
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
      throw new Error(
        "Файли завантажено, але каталог не оновився"
      );
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        title,
        path,
        cover: coverPath
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
