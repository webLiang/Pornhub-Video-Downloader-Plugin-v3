import type { SiteGetUrls } from './types';
import { getTangxinVlogUrls } from './tangxinvlog';

/**
 * Per-site sniff registry (hostname → getUrls).
 * To add a site: implement under sites/<site>/ and register here.
 */
export const siteHostGetUrls: Record<string, { getUrls: SiteGetUrls }> = {
  'tangxinvlog.app': {
    getUrls: getTangxinVlogUrls,
  },
};
