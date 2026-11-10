import { installHuangdouBridge } from '../injected/sites/huangdou/pageBridge';
import huangdouDomains from '../injected/sites/huangdou/domains.json';
import { installHuangguoBridge } from '../injected/sites/huangguo/pageBridge';
import huangguoDomains from '../injected/sites/huangguo/domains.json';

const registrableDomain = location.hostname.split('.').slice(-2).join('.');
if (huangdouDomains.includes(registrableDomain)) {
  installHuangdouBridge();
}
if (huangguoDomains.includes(registrableDomain)) {
  installHuangguoBridge();
}
