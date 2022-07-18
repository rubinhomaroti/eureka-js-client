import request from 'request';
import async from 'async';
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
        this.metadata = null;
        this.requestMetadata();
    }

    fetchMetadata(resultsCallback) {
        async.parallel({
            'ami-id': callback => {
                this.lookupMetadataKey('ImageID', callback);
            },
            'instance-id': callback => {
                this.lookupMetadataKey('DockerId', callback);
            },
            'instance-type': callback => {
                callback(null, 'FARGATE');
            },
            'local-ipv4': callback => {
                this.lookupNetworkMetadata('IPv4Addresses', callback);
            },
            'local-hostname': callback => {
                this.lookupNetworkMetadata('PrivateDNSName', callback);
            },
            'availability-zone': callback => {
                this.lookupMetadataKey('AvailabilityZone', callback);
            },
            'public-hostname': callback => {
                // Same as local-hostname, because until now AWS doesn't provide public DNS name in the endpoint
                this.lookupNetworkMetadata('PrivateDNSName', callback);
            },
            'public-ipv4': callback => {
                // Same as local-ipv4, because until now AWS doesn't provide public IPv4 in the endpoint
                this.lookupNetworkMetadata('IPv4Addresses', callback);
            },
            'mac': callback => {
                this.lookupNetworkMetadata('MACAddress', callback);
            },
            'vpc-id': callback => {
                // awsvpc (fixed, because until now AWS doesn't provide VPC ID in the endpoint)
                callback(null, 'awsvpc');
            },
            accountId: callback => {
                // the accountId is in the identity document.
                this.lookupInstanceIdentity(callback);
            }
        }, (error, results) => {
            this.logger.debug('Found Instance AWS Metadata', results);
            const filteredResults = Object.keys(results).reduce((filtered, prop) => {
                if (results[prop]) filtered[prop] = results[prop];
                return filtered;
            }, {});
            resultsCallback(filteredResults);
        });
    }

    requestMetadata() {
        request.get({
            url: this.host,
        }, (error, response, body) => {
            if (error || response.statusCode !== 200) {
                this.logger.error('Error requesting metadata', error);
            } else {
                this.metadata = body;
            }
        });
    }

    lookupMetadataKey(key, callback) {
        if (!this.metadata) {
            callback(null, null);
            return;
        }

        callback(null, this.metadata[key] ?? null);
    }

    lookupNetworkMetadata(key, callback) {
        if (!this.metadata) {
            callback(null, null);
            return;
        }

        if (this.metadata.Networks && this.metadata.Networks.length > 0) {
            const property = this.metadata.Networks[0][key];
            if (!property) {
                callback(null, null);
                return
            }
            callback(null, Array.isArray(property) ? property[0] : property);
        }

        callback(null, this.metadata[key] ?? null);
    }

    lookupInstanceIdentity(callback) {
        if (!this.metadata) {
            callback(null, null);
            return;
        }

        if (this.metadata.ContainerARN) {
            // ContainerARN.split(':')[4] (arn:aws:ecs:us-west-2:111122223333)
            const arn = this.metadata.ContainerARN.split(':');
            if (arn.length === 5) {
                callback(null, arn[4]);
                return;
            }
        }

        callback(null, null);
    }
}
