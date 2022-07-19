import request from 'request';
import Logger from './Logger';

/*
  Utility class for pulling AWS metadata that Eureka requires when
  registering as an Amazon instance (datacenter) on ECS Fargate v4 (1.4.0).
  https://docs.aws.amazon.com/AmazonECS/latest/userguide/task-metadata-endpoint-v4-fargate.html
*/
export default class AwsFargateMetadata {

    //TODO Add support for another versions of ECS Fargate metadata endpoints (v3 and future versions). Currently (July 2022) only v4 is supported.
    constructor(config = {}) {
        this.logger = config.logger || new Logger();
        this.host = process.env.ECS_CONTAINER_METADATA_URI_V4;
    }

    fetchMetadata(resultsCallback) {
        request.get({
            url: this.host,
        }, (error, response, body) => {
            if (error || response.statusCode !== 200) {
                console.error('Eureka Client - Error requesting metadata: ' + error);
                resultsCallback(null);
            } else {
                console.debug('Eureka - Received metadata: ' + JSON.stringify(body));
                const metadata = JSON.parse(body);
                const results = {
                    'ami-id': this.lookupMetadataKey('ImageID', metadata),
                    'instance-id': this.lookupMetadataKey('DockerId', metadata),
                    'instance-type': 'FARGATE',
                    'local-ipv4': this.lookupNetworkMetadata('IPv4Addresses', metadata),
                    'local-hostname': this.lookupNetworkMetadata('PrivateDNSName', metadata),
                    'availability-zone': this.lookupMetadataKey('AvailabilityZone', metadata),
                    'public-hostname': this.lookupNetworkMetadata('PrivateDNSName', metadata),
                    'public-ipv4': this.lookupNetworkMetadata('IPv4Addresses', metadata),
                    'mac': this.lookupNetworkMetadata('MACAddress', metadata),
                    'vpc-id': 'awsvpc',
                    'accountId': this.lookupInstanceIdentity(metadata)
                }
                console.debug('Eureka - Parsed Instance AWS Metadata: ' + JSON.stringify(results));
                const filteredResults = Object.keys(results).reduce((filtered, prop) => {
                    if (results[prop]) filtered[prop] = results[prop];
                    return filtered;
                }, {});
                resultsCallback(filteredResults);
            }
        });
    }

    lookupMetadataKey(key, metadata) {
        if (metadata[key] === null || metadata[key] === undefined) {
            return null;
        }

        return metadata[key];
    }

    lookupNetworkMetadata(key, metadata) {
        if (metadata.Networks && metadata.Networks.length > 0) {
            const property = metadata.Networks[0][key];
            if (!property) {
                return null;
            }
            return Array.isArray(property) ? property[0] : property;
        }
    }

    lookupInstanceIdentity(metadata) {
        if (metadata.ContainerARN) {
            // ContainerARN.split(':')[4] (arn:aws:ecs:us-west-2:111122223333)
            const arn = metadata.ContainerARN.split(':');
            if (arn.length >= 5) {
                return arn[4];
            }
        }

        return null;
    }
}
