# 1. ใช้ Node.js 22 Alpine เป็น Base Image (@line/bot-sdk ต้องการ Node >=22)
FROM node:22-alpine

# 1.1 Alpine (musl) ไม่มี libssl ติดมา Prisma query engine ต้องใช้ ถ้าไม่ลงจะหาเอนจินไม่เจอตอนรัน
RUN apk add --no-cache openssl

# 2. กำหนด Working Directory สำหรับ Container
WORKDIR /app

# 3. คัดลอก package.json และ yarn.lock เพื่อทำ Caching Layer
COPY package.json yarn.lock ./

# 4. ติดตั้ง Dependencies ด้วย Yarn
RUN yarn install --frozen-lockfile

# 5. คัดลอก ซอร์สโค้ด ทั้งหมดเข้า Container
COPY . .

# 5.1 Generate Prisma Client (ต้องมี schema.prisma ก่อน ถึงรันตรงนี้ได้ หลัง COPY . .)
RUN npx prisma generate

# 6. เปิดพอร์ต 3000 สำหรับ Backend API
EXPOSE 3000

# 7. Schema sync ทำแยกเอง (prisma db push) ไม่ auto-run ตอน start เพราะ db push ทำ data loss ได้ถ้าไม่รีวิว diff ก่อน
CMD ["yarn", "start"]
