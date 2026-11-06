(() => {
  const rows = [
    [
      ["guest_name", "Name1", 200, "text"],
      ["gender", "Gender", 20, "select"],
      ["age_group", "Age", 20, "select"],
    ],
    [["guest_address", "Address", 500, "text"]],
    [
      ["guest_phone", "Phone", 50, "tel"],
      ["guest_email", "Email", 254, "email"],
    ],
    [
      ["nationality", "Nationality", 200, "text"],
      ["passport_number", "Passport", 200, "text"],
    ],
  ];

  const choices = {
    gender: ["男性", "女性", "回答しない/その他"],
    age_group: ["10代以下", "20代", "30代", "40代", "50代", "60代以上"],
  };

  const noticeText =
    "ℹ️ According to Japanese law (the Hotels and Inns Act), all text-based registration and a photo/copy of the passport are mandatory for guests who do not have an address in Japan. Thank you for your cooperation.";

  function createInput(index, key, labelText, maxLength, type, guest, options) {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "min-width:0;margin-bottom:4px;";

    const inputId =
      options.idStyle === "precheckin"
        ? `${key}_${index}`
        : `guest-${index}-${key}`;

    const label = document.createElement("label");
    label.htmlFor = inputId;
    label.dataset.labelFor = key;
    label.textContent = labelText;
    label.style.cssText =
      "display:block;font-weight:600;margin-bottom:4px;";

    let input;

    if (type === "select") {
      input = document.createElement("select");
      input.style.cssText =
        "box-sizing:border-box;width:100%;padding:9px;border:1px solid #94a3b8;border-radius:5px;background:white;";

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "選択してください";
      input.appendChild(placeholder);

      for (const choice of choices[key]) {
        const option = document.createElement("option");
        option.value = choice;
        option.textContent = choice;
        input.appendChild(option);
      }
    } else {
      input = document.createElement("input");
      input.type = type;
      input.maxLength = maxLength;
      input.autocomplete = "off";
      input.style.cssText =
        "box-sizing:border-box;width:100%;padding:9px;border:1px solid #94a3b8;border-radius:5px;";
    }

    input.id = inputId;
    input.name = key;
    input.dataset.guestIndex = String(index);
    input.dataset.field = key;
    input.value = guest?.[key] || "";

    if (options.requiredFields && !["nationality", "passport_number"].includes(key)) {
      input.required = true;
    }

    if (key === "guest_email") {
      input.autocomplete = "email";
    } else if (key === "guest_phone") {
      input.autocomplete = "tel";
    } else if (key === "guest_name") {
      input.autocomplete = index === 0 ? "name" : "off";
    } else if (key === "guest_address") {
      input.autocomplete = index === 0 ? "street-address" : "off";
    }

    wrapper.appendChild(label);
    wrapper.appendChild(input);

    return wrapper;
  }

  function createSection(options) {
    const {
      index,
      guest = {},
      isPrimary,
      headingText,
      sectionId,
      sectionClass,
      japanResident = false,
      idStyle = "admin",
      requiredFields = false,
      addressLockMode = "disabled",
      getPrimaryAddress = () => "",
    } = options;

    const section = document.createElement("section");

    if (sectionId) section.id = sectionId;
    if (sectionClass) section.className = sectionClass;

    section.style.cssText =
      "border:1px solid #cbd5e1;border-radius:8px;padding:14px;margin-top:14px;";

    const heading = document.createElement("h3");
    heading.textContent = headingText;
    heading.style.marginTop = "0";
    section.appendChild(heading);

    if (!isPrimary) {
      const sameLabel = document.createElement("label");
      sameLabel.style.cssText =
        "display:flex;gap:8px;align-items:center;margin-bottom:12px;";

      const sameCheckbox = document.createElement("input");
      sameCheckbox.type = "checkbox";
      sameCheckbox.dataset.role = "same-address";
      sameCheckbox.name = "same_address";

      sameLabel.appendChild(sameCheckbox);
      sameLabel.append("代表者と同じ住所");
      section.appendChild(sameLabel);
    }

    const domesticLabel = document.createElement("label");
    domesticLabel.style.cssText =
      "display:flex;gap:8px;align-items:center;font-weight:600;margin-bottom:4px;";

    const domesticCheckbox = document.createElement("input");
    domesticCheckbox.type = "checkbox";
    domesticCheckbox.dataset.role = "japan-resident";
    domesticCheckbox.name = "japan_resident";
    domesticCheckbox.checked = japanResident;

    domesticLabel.appendChild(domesticCheckbox);
    domesticLabel.append("日本国内に住所がある");
    section.appendChild(domesticLabel);

    const hint = document.createElement("p");
    hint.textContent =
      "チェックすると、国籍・パスポート番号は入力不要になります。";
    hint.style.cssText =
      "font-size:0.85rem;color:#64748b;margin:4px 0 12px;";
    section.appendChild(hint);

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = document.createElement("div");
      row.style.cssText =
        "display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr) minmax(0,1fr);gap:3px;margin-bottom:10px;";
      if (rowIndex === 1) {
        row.style.gridTemplateColumns = "minmax(0,1fr)";
      } else if (rowIndex === 2) {
        row.style.gridTemplateColumns = "minmax(0,1fr) minmax(0,1.4fr)";
      } else if (rowIndex === 3) {
        row.style.gridTemplateColumns = "minmax(0,1fr) minmax(0,1.4fr)";
      }
      for (const [key, label, maxLength, type] of rows[rowIndex]) {
        row.appendChild(
          createInput(index, key, label, maxLength, type, guest, {
            idStyle,
            requiredFields,
          }),
        );
      }

      section.appendChild(row);
    }

    const passportNotice = document.createElement("p");
    passportNotice.dataset.role = "passport-notice";
    passportNotice.textContent = noticeText;
    passportNotice.style.cssText =
      "font-size:0.8rem;line-height:1.5;margin:0 0 10px;color:#475569;";
    section.appendChild(passportNotice);

    function update() {
      const domestic = section.querySelector('[data-role="japan-resident"]');
      const nationality = section.querySelector('[name="nationality"]');
      const passport = section.querySelector('[name="passport_number"]');
      const address = section.querySelector('[name="guest_address"]');
      const sameAddress = section.querySelector('[data-role="same-address"]');

      if (domestic.checked) {
        nationality.value = "";
        passport.value = "";
      }

      nationality.disabled = domestic.checked;
      passport.disabled = domestic.checked;
      nationality.required = requiredFields && !domestic.checked;
      passport.required = requiredFields && !domestic.checked;

      passportNotice.style.display = domestic.checked ? "none" : "block";

      const isSameAddress = !isPrimary && sameAddress?.checked;

      if (isSameAddress) {
        address.value = getPrimaryAddress() || "";

        if (addressLockMode === "readonly") {
          address.readOnly = true;
        } else {
          address.disabled = true;
        }
      } else {
        address.disabled = false;
        address.readOnly = false;
      }

      const nationalityLabel = section.querySelector(
        '[data-label-for="nationality"]',
      );
      const passportLabel = section.querySelector(
        '[data-label-for="passport_number"]',
      );
      const addressLabel = section.querySelector(
        '[data-label-for="guest_address"]',
      );

      nationalityLabel.textContent = domestic.checked
        ? "Nationality(NR)"
        : "Nationality";

      passportLabel.textContent = domestic.checked
        ? "Passport(NR)"
        : "Passport";

      addressLabel.textContent = isSameAddress
        ? "Address (Same as Primary)"
        : "Address";
    }

    domesticCheckbox.addEventListener("change", update);

    const sameCheckbox = section.querySelector('[data-role="same-address"]');
    if (sameCheckbox) {
      sameCheckbox.addEventListener("change", update);
    }

    section.updateGuestFields = update;
    update();

    return section;
  }

  window.GuestForm = {
    createSection,
  };
})();