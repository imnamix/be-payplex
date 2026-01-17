const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const cloudinary = require("../config/cloudinary");

// Configure email service
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Generate OTP
const generateOTP = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

// Generate JWT Token
const generateToken = (userId, role) => {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};

// Send OTP Email
const sendOTPEmail = async (email, otp) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your OTP for Email Verification",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Email Verification</h2>
          <p>Your One-Time Password (OTP) is:</p>
          <h3 style="color: #007bff; font-size: 24px; letter-spacing: 2px;">${otp}</h3>
          <p>This OTP will expire in ${process.env.OTP_EXPIRE_MINUTES} minutes.</p>
          <p>If you didn't request this OTP, please ignore this email.</p>
        </div>
      `,
    });
    return true;
  } catch (error) {
    console.error("Error sending OTP email:", error);
    return false;
  }
};

// Upload Image (without authentication - for registration)
exports.uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    try {
      // Upload image to Cloudinary
      const uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: "payplex/temp-uploads", // Temporary folder for registration images
            resource_type: "auto",
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          },
        );

        uploadStream.end(req.file.buffer);
      });

      res.status(200).json({
        message: "Image uploaded successfully",
        imageUrl: uploadResult.secure_url,
        public_id: uploadResult.public_id,
      });
    } catch (uploadError) {
      return res
        .status(500)
        .json({
          message: "Image upload to Cloudinary failed",
          error: uploadError.message,
        });
    }
  } catch (error) {
    res.status(500).json({ message: "Upload failed", error: error.message });
  }
};

// Register User
exports.register = async (req, res) => {
  try {
    const { name, address, email, contactNumber, dob, password, profilePhoto } =
      req.body;

    // Validation
    if (!name || !address || !email || !contactNumber || !dob || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email is already registered" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate OTP
    const otp = generateOTP();
    const otpExpiresAt = new Date(
      Date.now() + parseInt(process.env.OTP_EXPIRE_MINUTES) * 60000,
    );

    // Create user
    const user = new User({
      name,
      address,
      email,
      contactNumber,
      dob,
      password: hashedPassword,
      profilePhoto,
      otp: {
        code: otp,
        expiresAt: otpExpiresAt,
      },
    });

    await user.save();

    // Send OTP email
    const emailSent = await sendOTPEmail(email, otp);

    if (!emailSent) {
      return res.status(500).json({ message: "Failed to send OTP email" });
    }

    res.status(201).json({
      message: "User registered successfully. OTP sent to email.",
      userId: user._id,
      email: user.email,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Registration failed", error: error.message });
  }
};

// Login User
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    // Find user with password field
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Check if email is verified
    if (!user.emailVerified) {
      // Send OTP for verification
      const otp = generateOTP();
      const otpExpiresAt = new Date(
        Date.now() + parseInt(process.env.OTP_EXPIRE_MINUTES) * 60000,
      );

      user.otp = {
        code: otp,
        expiresAt: otpExpiresAt,
      };
      await user.save();

      await sendOTPEmail(email, otp);

      return res.status(403).json({
        message: "Email not verified. OTP sent to your email.",
        userId: user._id,
        requiresVerification: true,
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Check user status
    if (user.status === "inactive") {
      return res.status(403).json({ message: "Your account is inactive" });
    }

    // Generate token
    const token = generateToken(user._id, user.role);

    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profilePhoto: user.profilePhoto,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Login failed", error: error.message });
  }
};

// Verify OTP
exports.verifyOTP = async (req, res) => {
  try {
    const { userId, otp } = req.body;

    // Validation
    if (!userId || !otp) {
      return res.status(400).json({ message: "User ID and OTP are required" });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check OTP
    if (!user.otp || !user.otp.code) {
      return res.status(400).json({ message: "No OTP found for this user" });
    }

    if (user.otp.code !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Check OTP expiration
    if (new Date() > user.otp.expiresAt) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    // Mark email as verified
    user.emailVerified = true;
    user.otp = { code: null, expiresAt: null };
    await user.save();

    // Generate token
    const token = generateToken(user._id, user.role);

    res.status(200).json({
      message: "Email verified successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "OTP verification failed", error: error.message });
  }
};

// Resend OTP
exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate new OTP
    const otp = generateOTP();
    const otpExpiresAt = new Date(
      Date.now() + parseInt(process.env.OTP_EXPIRE_MINUTES) * 60000,
    );

    user.otp = {
      code: otp,
      expiresAt: otpExpiresAt,
    };
    await user.save();

    // Send OTP email
    const emailSent = await sendOTPEmail(email, otp);

    if (!emailSent) {
      return res.status(500).json({ message: "Failed to send OTP email" });
    }

    res.status(200).json({
      message: "OTP resent successfully",
      userId: user._id,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to resend OTP", error: error.message });
  }
};

// Update Profile with Profile Photo Upload to Cloudinary
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, address, contactNumber, dob } = req.body;

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update basic fields
    if (name) user.name = name;
    if (address) user.address = address;
    if (contactNumber) user.contactNumber = contactNumber;
    if (dob) user.dob = dob;

    // Handle profile photo upload
    if (req.file) {
      try {
        // Delete old profile photo if exists
        if (user.profilePhoto && user.profilePhoto.public_id) {
          await cloudinary.uploader.destroy(user.profilePhoto.public_id);
        }

        // Upload new profile photo to Cloudinary
        const uploadResult = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: "payplex/profile-photos",
              resource_type: "auto",
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            },
          );

          uploadStream.end(req.file.buffer);
        });

        user.profilePhoto = {
          public_id: uploadResult.public_id,
          url: uploadResult.secure_url,
        };
      } catch (uploadError) {
        return res
          .status(500)
          .json({ message: "File upload failed", error: uploadError.message });
      }
    }

    await user.save();

    res.status(200).json({
      message: "Profile updated successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        address: user.address,
        contactNumber: user.contactNumber,
        dob: user.dob,
        profilePhoto: user.profilePhoto,
        role: user.role,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Profile update failed", error: error.message });
  }
};

// Get User Profile
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "Profile fetched successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        address: user.address,
        contactNumber: user.contactNumber,
        dob: user.dob,
        profilePhoto: user.profilePhoto,
        role: user.role,
        status: user.status,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch profile", error: error.message });
  }
};
