import { cidrSubnet, isEqual } from 'ip'

export function isIpEqualOrInCidr(queriedIp: string, ipOrCidrSubnet: string): boolean {
	try {
		return isEqual(queriedIp, ipOrCidrSubnet)
	} catch (_) {
		//ip is in CIDR notation so it trows error
		try {
			return cidrSubnet(ipOrCidrSubnet).contains(queriedIp)
		} catch (err) {
			return false
		}
	}
}
