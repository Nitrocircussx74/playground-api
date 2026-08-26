const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const config = require('./env');

/**
 * ตั้งค่า Passport Google OAuth 2.0 Strategy
 */
passport.use(
  new GoogleStrategy(
    {
      clientID: config.google.clientId,
      clientSecret: config.google.clientSecret,
      callbackURL: config.google.callbackUrl
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // ในระบบจริง: นำ profile.id หรือ profile.emails[0].value ไปค้นหาหรือบันทึกลง Database
        const user = {
          id: profile.id,
          displayName: profile.displayName,
          email: profile.emails && profile.emails[0] ? profile.emails[0].value : '',
          avatar: profile.photos && profile.photos[0] ? profile.photos[0].value : '',
          provider: 'google'
        };

        // ส่งข้อมูล user ถัดไปให้ Auth Controller
        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

module.exports = passport;
