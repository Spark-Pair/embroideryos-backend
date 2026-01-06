import User from '../models/User.js';
import Business from '../models/Business.js';
import jwt from 'jsonwebtoken';

const createToken = (user) =>
  jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE
  });

/* LOGIN */
export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username }); // must NOT use .lean()
    if (!user) {
      return res.json({ message: 'Invalid credentials' });
    }

    const match = await user.matchPassword(password);
    if (!match) {
      return res.json({ message: 'Invalid credentials' });
    }

    // ✅ Check if user is active
    if (!user.isActive) {
      return res.json({ message: 'Your account has been deactivated' });
    }

    // ✅ Developers can login without business check
    if (user.role === 'developer') {
      const token = createToken(user);
      return res.json({ 
        token,
        user: {
          id: user._id,
          name: user.name,
          username: user.username,
          role: user.role,
          isActive: user.isActive
        }
      });
    }

    // ✅ Check if user has business
    if (!user.businessId) {
      return res.json({ message: 'No business associated with your account' });
    }

    // ✅ Check business status
    const business = await Business.findById(user.businessId);
    if (!business) {
      return res.json({ message: 'Business not found' });
    }

    if (!business.isActive) {
      return res.json({ message: 'Your business account has been deactivated' });
    }

    const token = createToken(user);

    res.json({ 
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
        isActive: user.isActive,
        businessId: user.businessId,
        businessName: business.name
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error. Try again.' });
  }
};

/* GET CURRENT USER */
export const me = async (req, res) => {
  try {
    // req.user comes from authenticate middleware (already checked)
    // req.business also available if not developer
    
    const response = {
      id: req.user._id,
      name: req.user.name,
      username: req.user.username,
      role: req.user.role,
      isActive: req.user.isActive,
    };

    // Add business info if available
    if (req.business) {
      response.business = {
        id: req.business._id,
        name: req.business.name,
        isActive: req.business.isActive
      };
    }

    res.json(response);
  } catch (err) {
    console.error('Me endpoint error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};