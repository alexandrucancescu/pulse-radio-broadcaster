import ip from 'ip'

export function isIpEqualOrInCidr(queriedIp: string, ipOrCidrSubnet: string): boolean {
	try {
		return ip.isEqual(queriedIp, ipOrCidrSubnet)
	} catch (_) {
		//ip is in CIDR notation so it trows error
		try {
			return ip.cidrSubnet(ipOrCidrSubnet).contains(queriedIp)
		} catch (err) {
			return false
		}
	}
}
