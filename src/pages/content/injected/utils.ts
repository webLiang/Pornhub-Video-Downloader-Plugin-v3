export function getTopDomain() {
  const currentDomain = window.location.host.toLowerCase();
  const domainParts = currentDomain.split('.');
  const topLevelDomain = domainParts[domainParts.length - 2];
  const secondLevelDomain = domainParts[domainParts.length - 1];
  const topDomain = topLevelDomain + '.' + secondLevelDomain;

  return topDomain;
}
