function createDownloadButton() {
  const linkBtn = document.createElement("a");
  linkBtn.id = "coursemos-download-btn";
  linkBtn.href = "#";
  linkBtn.textContent = "강의 다운로드";
  return linkBtn;
}

function downloadable(handler) {
  const btn = document.querySelector("#coursemos-download-btn");
  if (btn) {
    btn.disabled = false;
    btn.textContent = "강의 다운로드";
    btn.style.cursor = "pointer";
    btn.onclick = handler;
  }
}

function downloading() {
  const btn = document.querySelector("#coursemos-download-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "처리 중 (최대 2분이 소요됩니다)";
    btn.style.cursor = "default";
    btn.onclick = (e) => {
      e.preventDefault();
    };
  }
}

window.addEventListener("load", () => {
  const header = document.querySelector("#vod_header");
  if (header) {
    // 해당 탭 트래킹 시작
    chrome.runtime.sendMessage({ type: "enableTracking" });

    // 다운로드 버튼 생성
    const linkBtn = createDownloadButton();
    linkBtn.onclick = (e) => {
      e.preventDefault();
      alert("아직 준비되지 않았습니다. 영상을 재생하고 잠시 기다려주세요.");
    };
    const thirdChild = header.children[2];
    if (thirdChild) {
      header.insertBefore(linkBtn, thirdChild);
    } else {
      header.appendChild(linkBtn);
    }
  }
});

async function fetchMediaUrl(mediaUrl) {
  const url = mediaUrl.endsWith(".mp4")
    ? mediaUrl
    : "http://localhost:7071/api/DownloadTrigger?mediaUrl=" + mediaUrl;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      alert("다운로드 API 호출에 실패했습니다.");
      return;
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = "video.mp4";
    document.body.appendChild(a);

    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (error) {
    alert(error);
  } finally {
    downloadable((e) => {
      e.preventDefault();
      downloading();
      fetchMediaUrl(mediaUrl);
    });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "enableDownloadButton") {
    const btn = document.querySelector("#coursemos-download-btn");
    if (btn) {
      const mediaUrl = message.mediaUrl;
      downloadable((e) => {
        e.preventDefault();
        downloading();
        fetchMediaUrl(mediaUrl);
      });
    }
  }
});
