import type { SiteGetUrls } from './types';
import { getAv123Urls } from './av123';
import { getMissavUrls } from './missav';
import { getTangxinVlogUrls } from './tangxinvlog';

/**
 * Per-site sniff registry (hostname → getUrls).
 * To add a site: implement under sites/<site>/ and register here.
 * Keys must match curTopDomain (last two hostname labels).
 */
export const siteHostGetUrls: Record<string, { getUrls: SiteGetUrls }> = {
  'tangxinvlog.app': {
    getUrls: getTangxinVlogUrls,
  },
  'missav.ws': {
    getUrls: getMissavUrls,
  },
  'missav.live': {
    getUrls: getMissavUrls,
  },
  'missav.com': {
    getUrls: getMissavUrls,
  },
  '123av.com': {
    getUrls: getAv123Urls,
  },
};
