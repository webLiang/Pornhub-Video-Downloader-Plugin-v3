import type { SiteGetUrls } from './types';
import { getTangxinVlogUrls } from './tangxinvlog';

/**
 * 独立站点嗅探注册表（域名 → getUrls）
 * 新增站点：在 sites/<site>/ 实现后在此挂载。
 */
export const siteHostGetUrls: Record<string, { getUrls: SiteGetUrls }> = {
  'tangxinvlog.app': {
    getUrls: getTangxinVlogUrls,
  },
};
