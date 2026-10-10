import type { SiteGetUrls } from './types';
import { getAv123Urls } from './av123';
import { getMissavUrls } from './missav';
import { getTangxinVlogUrls } from './tangxinvlog';
import { getRouvideoUrls } from './rouvideo';
import { getHuangguoUrls } from './huangguo';
import { getHuangdouUrls } from './huangdou';
import huangdouDomains from './huangdou/domains.json';

/**
 * Per-site sniff registry (hostname → getUrls).
 * To add a site: implement under sites/<site>/ and register here.
 * Keys must match curTopDomain (last two hostname labels).
 */
export const siteHostGetUrls: Record<string, { getUrls: SiteGetUrls }> = {
  'huangguoai.com': {
    getUrls: getHuangguoUrls,
  },
  ...Object.fromEntries(huangdouDomains.map(domain => [domain, { getUrls: getHuangdouUrls }])),
  'rou.video': {
    getUrls: getRouvideoUrls,
  },
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
