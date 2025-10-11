import { create } from 'ipfs-http-client';

const ipfs = create({
  host: 'localhost',
  port: 5004,
  protocol: 'http',
});

export default ipfs;
  