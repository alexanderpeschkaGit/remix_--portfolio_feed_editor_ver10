// Cloud comparison helpers extracted from App.tsx (deep-refactor batch 3).
export const toStableJson = (value: any): string => {
      const normalize = (v: any): any => {
        if (v === null || v === undefined) return v;
        if (Array.isArray(v)) return v.map(normalize);
        if (typeof v !== 'object') return v;
        const out: Record<string, any> = {};
        for (const key of Object.keys(v).sort()) {
          const next = normalize(v[key]);
          if (next !== undefined) out[key] = next;
        }
        return out;
      };
      return JSON.stringify(normalize(value));
    };

    export const normalizeMediaForCloudCompare = (media: any) => {
      if (!media || typeof media !== 'object') return media;
      const m: any = { ...media };
      delete m.image_preview;
      delete m.uploadId;
      delete m.largeUrl;
      delete m.url_o;
      delete m.url_l;
      delete m.url_q;
      delete m.url_sq;
      delete m.url_m;
      delete m.local_highres;
      delete m.localUrl;
      delete m.local_large_variant;
      if (m.link && !m.url) m.url = m.link;
      delete m.link;
      for (const k of Object.keys(m)) {
        if (m[k] === '') delete m[k];
      }
      return m;
    };

    export const normalizePostForCloudCompare = (post: any) => {
      if (!post || typeof post !== 'object') return post;
      const p: any = { ...post };
      delete p.image_preview;
      delete p.uploadId;
      delete p.largeUrl;
      delete p.url_o;
      delete p.url_l;
      delete p.url_q;
      delete p.url_sq;
      delete p.url_m;
      delete p.local_highres;
      delete p.localUrl;
      delete p.local_large_variant;
      if (p.link && !p.url) p.url = p.link;
      delete p.link;
      for (const k of Object.keys(p)) {
        if (p[k] === '') delete p[k];
      }
      if (Array.isArray(p.mergedMedia)) {
        p.mergedMedia = p.mergedMedia.map(normalizeMediaForCloudCompare);
      }
      return p;
    };

    export const getPostSignature = (post: any) => toStableJson(normalizePostForCloudCompare(post));

    