import { installHuangdouBridge } from '../injected/sites/huangdou/pageBridge';
import huangdouDomains from '../injected/sites/huangdou/domains.json';

if (huangdouDomains.includes(location.hostname.split('.').slice(-2).join('.'))) {
  installHuangdouBridge();
}
