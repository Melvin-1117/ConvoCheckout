import dotenv from 'dotenv';
import { createApp } from './app';

dotenv.config();

const port = process.env.PORT || 4000;
const app = createApp();

app.listen(port, () => {
  console.log(`🚀 ConvoCheckout Server running on http://localhost:${port}`);
  console.log(`📦 Catalog API available at http://localhost:${port}/api/products`);
  console.log(`🔍 Search API available at http://localhost:${port}/api/products/search?q=shirt`);
});
