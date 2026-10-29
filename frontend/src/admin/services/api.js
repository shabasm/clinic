import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const refresh = localStorage.getItem("refresh");
    if (
      error.response?.status === 401 &&
      refresh &&
      !originalRequest?._retry &&
      !originalRequest?.url?.includes("token/refresh/")
    ) {
      originalRequest._retry = true;
      try {
        const { data } = await axios.post(
          `${api.defaults.baseURL}token/refresh/`,
          { refresh },
        );
        localStorage.setItem("access", data.access);
        originalRequest.headers.Authorization = `Bearer ${data.access}`;
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem("access");
        localStorage.removeItem("refresh");
        localStorage.removeItem("role");
        localStorage.removeItem("displayName");
        window.location.assign("/login");
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

export function collection(data) {
  return Array.isArray(data) ? data : data?.results || [];
}

export function formatId(prefix, id) {
  if (id === null || id === undefined || id === "") return "—";
  const numericId = String(id).match(/\d+$/)?.[0];
  if (!numericId) return String(id);
  return `${prefix}${numericId.padStart(5, "0")}`;
}

export function formatDate(value) {
  if (!value) return "—";
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatMoney(value) {
  return `₹${Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function badgeColor(status) {
  if (["Active", "In stock", "Available", "Replenished"].includes(status)) return "success";
  if (["Pending", "Low stock"].includes(status)) return "warning";
  if (["Approved"].includes(status)) return "info";
  if (["Expired", "Out of stock", "Unavailable"].includes(status)) return "danger";
  return "secondary";
}

const validationFieldLabels = {
  name: "Name",
  department: "Department",
  staff: "Staff",
  username: "Username",
  password: "Password",
  manufacturer: "Manufacturer",
  price: "Price",
  stock_quantity: "Stock quantity",
  expiry_date: "Expiry date",
  cost: "Cost",
  quantity: "Quantity",
  full_name: "Name",
  emergency_contact_name: "Emergency name",
  date_of_birth: "Date of birth",
  emergency_contact_phone: "Emergency phone",
  joining_date: "Joining date",
  qualification: "Qualification",
  consultation_fee: "Consultation fee",
  consultation_days: "Consultation days",
  consultation_end_time: "End time",
  experience_years: "Experience",
  medical_license_number: "License",
  low_stock_threshold: "Low-stock threshold",
  registration_fee: "Registration fee",
  normal_values: "Normal values",
  requested_quantity: "Quantity",
  received_quantity: "Quantity",
  new_password: "Password",
  staff_id: "Staff",
  is_active: "Status",
  non_field_errors: "Error",
};

function firstError(value) {
  if (Array.isArray(value)) return value.length ? firstError(value[0]) : "";
  if (typeof value === "string") {
    const bounds = value.match(/Ensure this value is greater than or equal to ([\d.]+)\./);
    if (bounds) return `Minimum: ${bounds[1]}.`;
    const upperBound = value.match(/Ensure this value is less than or equal to ([\d.]+)\./);
    if (upperBound) return `Maximum: ${upperBound[1]}.`;
    const minimumLength = value.match(/Ensure this field has at least (\d+) characters?\./);
    if (minimumLength) return `Enter ${minimumLength[1]}+ characters.`;
    const maximumLength = value.match(/Ensure this field has no more than (\d+) characters?\./);
    if (maximumLength) return `Maximum ${maximumLength[1]} characters.`;
    if (value === "This field may not be blank." || value === "This field may not be null.") {
      return "This field is required.";
    }
    if (value === "A valid integer is required.") return "Enter a whole number.";
    if (value === "A valid number is required.") return "Enter a valid number.";
    if (value === "A valid email address is required.") return "Enter a valid email.";
    if (value === "Must be a valid boolean.") return "Choose a valid status.";
    if (value === "Ensure that there are no more than 2 decimal places.") return "Use up to 2 decimals.";
    return value;
  }
  if (value && typeof value === "object") {
    const first = Object.values(value)[0];
    return first === undefined ? "" : firstError(first);
  }
  return value === undefined || value === null ? "" : String(value);
}

export function errorMessage(error) {
  const data = error.response?.data;
  if (typeof data === "string") return data;
  if (data?.detail) return firstError(data.detail);
  if (data?.error) return firstError(data.error);
  if (data && typeof data === "object") {
    const [field, messages] = Object.entries(data)[0] || [];
    const message = firstError(messages);
    if (field && message) {
      const label = validationFieldLabels[field] || field.replaceAll("_", " ");
      if (
        message.toLowerCase().startsWith(label.toLowerCase()) ||
        /^(department|medicine|test)\b/i.test(message)
      ) {
        return message;
      }
      return field === "non_field_errors" ? message : `${label}: ${message}`;
    }
  }
  return error.message || "Something went wrong. Please try again.";
}

export function validateForm(form) {
  if (!form.dataset.validationClearBound) {
    const clearFieldError = (event) => {
      const control = event.target;
      if (!control.willValidate) return;
      control.classList.remove("is-invalid");
      const anchor = control.closest(".input-group") || control;
      const feedback = anchor.nextElementSibling;
      if (feedback?.dataset.validationFeedback === "true") {
        feedback.textContent = "";
        feedback.classList.remove("d-block");
      }
    };
    form.addEventListener("input", clearFieldError);
    form.addEventListener("change", clearFieldError);
    form.dataset.validationClearBound = "true";
  }

  const controls = Array.from(form.elements).filter((control) =>
    control.willValidate && !control.disabled
  );
  form.querySelectorAll(".is-invalid").forEach((control) => control.classList.remove("is-invalid"));
  form.querySelectorAll("[data-validation-feedback]").forEach((feedback) => {
    feedback.textContent = "";
    feedback.classList.remove("d-block");
  });

  let firstInvalid = null;
  for (const control of controls) {
    const validity = control.validity;
    const missingTrimmedValue = control.dataset.trimRequired === "true" &&
      !control.value.trim();
    const invalidWholeNumber = control.type === "number" &&
      control.step === "1" &&
      control.value !== "" &&
      !/^\d+$/.test(control.value);
    const invalidMoney = control.type === "number" &&
      control.step === "0.01" &&
      control.value !== "" &&
      !/^\d+(\.\d{1,2})?$/.test(control.value);
    if (
      validity.valid &&
      !missingTrimmedValue &&
      !invalidWholeNumber &&
      !invalidMoney
    ) continue;

    const label = control.labels?.[0]?.textContent.replace("*", "").trim() || "Field";
    let message = control.title;
    if (validity.valueMissing || missingTrimmedValue) {
      message = control.tagName === "SELECT"
        ? `Choose ${label.toLowerCase()}.`
        : `${label} is required.`;
    } else if (validity.typeMismatch) {
      message = control.type === "email" ? "Enter a valid email." : `Enter a valid ${label.toLowerCase()}.`;
    } else if (validity.tooShort) {
      message = `${label}: Enter ${control.minLength}+ characters.`;
    } else if (validity.tooLong) {
      message = `${label}: Maximum ${control.maxLength} characters.`;
    } else if (validity.rangeUnderflow) {
      message = control.type === "date"
        ? `${label} cannot be in the past.`
        : `${label}: Minimum is ${control.min}.`;
    } else if (validity.rangeOverflow) {
      message = control.type === "date"
        ? `${label} cannot be in the future.`
        : `${label}: Maximum is ${control.max}.`;
    } else if (invalidWholeNumber) {
      message = `${label}: Enter a whole number.`;
    } else if (invalidMoney) {
      message = `${label}: Use up to 2 decimals.`;
    } else if (validity.stepMismatch) {
      message = control.step === "1"
        ? `${label}: Enter a whole number.`
        : `${label}: Enter a valid amount.`;
    } else if (validity.patternMismatch) {
      message = control.title || `${label}: Enter a valid value.`;
    } else if (validity.badInput) {
      message = `${label}: Enter a valid value.`;
    }

    control.classList.add("is-invalid");
    const anchor = control.closest(".input-group") || control;
    let feedback = anchor.nextElementSibling;
    if (!feedback?.classList.contains("invalid-feedback")) {
      feedback = document.createElement("div");
      feedback.className = "invalid-feedback";
      feedback.dataset.validationFeedback = "true";
      anchor.after(feedback);
    } else {
      feedback.dataset.validationFeedback = "true";
    }
    feedback.textContent = message;
    feedback.classList.add("d-block");
    if (!firstInvalid) firstInvalid = control;
  }
  if (firstInvalid) {
    firstInvalid.focus();
    return false;
  }
  return true;
}

export default api;
