const interceptUrls = ['/media'];
const hosts = ['redtube.com'];

function getTopDomain() {
  const currentDomain = window.location.host.toLowerCase();
  const domainParts = currentDomain.split('.');
  const topLevelDomain = domainParts[domainParts.length - 2];
  const secondLevelDomain = domainParts[domainParts.length - 1];
  const topDomain = topLevelDomain + '.' + secondLevelDomain;

  return topDomain;
}

const curTopDomain = getTopDomain();

const fn = function () {
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch(...(args as [RequestInfo, RequestInit]));

    const curUrl = args[0] as string;
    const inInterceptUrls = interceptUrls.some(url => curUrl.includes(url));
    console.log('Fetch Response URL:1111', hosts.includes(curTopDomain), inInterceptUrls);
    if (hosts.includes(curTopDomain) && inInterceptUrls) {
      const clonedResponse = response.clone();
      clonedResponse
        .json()
        .then(data => {
          window.inInterceptData = data;
          console.log('Fetch Response Data:', data, window.inInterceptData);
        })
        .catch(() => {
          clonedResponse.text().then(text => {
            console.log('Fetch Response Text:', text);
          });
        });
    }
    return response;
  };
};

fn();

export default fn;
