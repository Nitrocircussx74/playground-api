# 1. ใช้ Node.js 20 Alpine เป็น Base Image
FROM node:20-alpine

# 2. กำหนด Working Directory สำหรับ Container
WORKDIR /app

# 3. คัดลอก package.json และ yarn.lock เพื่อทำ Caching Layer
COPY package.json yarn.lock ./

# 4. ติดตั้ง Dependencies ด้วย Yarn
RUN yarn install --frozen-lockfile

# 5. คัดลอก ซอร์สโค้ด ทั้งหมดเข้า Container
COPY . .

# 6. เปิดพอร์ต 3000 สำหรับ Backend API
EXPOSE 3000

# 7. สั่งรัน Database Migrations และเริ่มทำงานเซิร์ฟเวอร์
CMD ["sh", "-c", "yarn migrate && yarn start"]
