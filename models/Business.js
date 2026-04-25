import mongoose from "mongoose";

const businessSchema = new mongoose.Schema({
  name: { type: String, required: true },
  person: { type: String, required: true },
  price: { type: Number, required: true },
  registration_date: { type: Date, default: Date.now },
  invoice_banner_data: { type: String, default: "" },
  invoice_banner_public_id: { type: String, default: "" },
  machine_options: {
    type: [String],
    default: [],
  },
  reference_data: {
    attendance_options: { type: [String], default: [] },
    staff_categories: { type: [String], default: [] },
    user_roles: { type: [String], default: [] },
    customer_payment_methods: { type: [String], default: [] },
    supplier_payment_methods: { type: [String], default: [] },
    staff_payment_types: { type: [String], default: [] },
    expense_types: { type: [String], default: [] },
    order_units: { type: [String], default: [] },
    crp_categories: { type: [String], default: [] },
    bank_suggestions: { type: [String], default: [] },
    party_suggestions: { type: [String], default: [] },
  },
  rule_data: {
    attendance_rules: {
      type: [
        {
          label: { type: String, default: "" },
          counts_record: { type: Boolean, default: true },
          counts_production: { type: Boolean, default: true },
          allows_bonus: { type: Boolean, default: true },
          pay_mode: { type: String, default: "salary_day_or_production" },
          allowance_code: { type: String, default: "normal" },
          upgrade_half_to_day: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
    customer_payment_method_rules: {
      type: [
        {
          method: { type: String, default: "" },
          requires_reference: { type: Boolean, default: false },
          requires_bank: { type: Boolean, default: false },
          requires_party: { type: Boolean, default: false },
          requires_issue_date: { type: Boolean, default: false },
          allows_clear_date: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
    staff_payment_type_rules: {
      type: [
        {
          type: { type: String, default: "" },
          history_effect: { type: String, default: "subtract" },
          current_effect: { type: String, default: "subtract" },
        },
      ],
      default: [],
    },
    expense_type_rules: {
      type: [
        {
          key: { type: String, default: "" },
          label: { type: String, default: "" },
          is_fixed: { type: Boolean, default: false },
          requires_supplier: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
    access_rules: {
      type: [
        {
          key: { type: String, default: "" },
          label: { type: String, default: "" },
          roles: { type: [String], default: [] },
          show_in_sidebar: { type: Boolean, default: true },
        },
      ],
      default: [],
    },
    allowance_rule: {
      min_records: { type: Number, default: 26 },
      max_absent: { type: Number, default: 0 },
      max_half: { type: Number, default: 1 },
    },
    display_preferences: {
      salary_slip_fields: { type: [String], default: [] },
      dashboard_staff_columns: { type: [String], default: [] },
      label_overrides: {
        type: [
          {
            key: { type: String, default: "" },
            label: { type: String, default: "" },
          },
        ],
        default: [],
      },
    },
  },
  shortcuts: {
    type: Map,
    of: String,
    default: {},
  },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model("Business", businessSchema);
