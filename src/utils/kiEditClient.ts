import { getAsString, getResolutionVariants } from "./postMediaHelpers";

export { getAsString, getResolutionVariants };

const blobToBase64 = (
  blob: Blob,
): Promise<{ data: string; mimeType: string } | null> =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const resStr = reader.result as string;
      const match = resStr.match(/^data:([^;]+);base64,(.+)$/);
      if (match) resolve({ mimeType: match[1], data: match[2] });
      else resolve(null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });

export interface RequestKiCaseStudyEditParams {
  title: string;
  description: string;
  mediaList: any[];
  getImageSrc: (media: any, preferLarge?: boolean) => string | undefined;
  getDisplayImage: (
    url: string | undefined,
    r2: boolean,
    embedded: boolean,
  ) => string | undefined;
  isR2Fallback: boolean;
  isEmbeddedData: boolean;
}

export async function requestKiCaseStudyEdit({
  title,
  description,
  mediaList,
  getImageSrc,
  getDisplayImage,
  isR2Fallback,
  isEmbeddedData,
}: RequestKiCaseStudyEditParams): Promise<string> {
  const imageCandidates: string[] = [];
  for (const m of mediaList) {
    const thumb =
      m?.image_thumb ||
      m?.custom_thumb ||
      m?.image_preview ||
      m?.image ||
      getImageSrc(m, false);
    if (thumb && typeof thumb === "string") {
      imageCandidates.push(thumb);
    }
  }

  const selectedThumbs = imageCandidates.slice(0, 5);
  const base64Images: Array<{ data: string; mimeType: string }> = [];

  for (const rawUrl of selectedThumbs) {
    try {
      const resolvedUrl =
        getDisplayImage(rawUrl, isR2Fallback, isEmbeddedData) || rawUrl;
      if (resolvedUrl.startsWith("data:")) {
        const match = resolvedUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          base64Images.push({ mimeType: match[1], data: match[2] });
          continue;
        }
      }
      const resp = await fetch(resolvedUrl);
      if (resp.ok) {
        const blob = await resp.blob();
        const b64 = await blobToBase64(blob);
        if (b64) base64Images.push(b64);
      }
    } catch (err) {
      console.warn(
        "Could not convert thumb to base64 in browser:",
        rawUrl,
        err,
      );
    }
  }

  const response = await fetch("/api/ki-edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      description,
      images: base64Images,
      imageUrls: selectedThumbs,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Fehler beim KI-Edit");
  }

  return data.text || "";
}
