// Translation dictionary (section 45). Coverage: primary navigation and the
// full customer ordering flow (home, menu, product, cart, checkout, order
// tracking, account) are translated. The admin dashboard (staff-facing, not
// customer-facing) and backend-generated validation/error message text are
// intentionally out of scope for this phase — see README "Known
// limitations". Every UI string used by a translated component goes
// through t(key) rather than being hard-coded, so adding a language later
// never requires touching component markup again.
export const translations = {
  ar: {
    nav_home: 'الرئيسية', nav_menu: 'القائمة', nav_about: 'من نحن', nav_gallery: 'معرض الصور',
    nav_contact: 'تواصل معنا', nav_orders: 'طلباتي', nav_login: 'تسجيل الدخول', nav_order_now: 'اطلب الآن',
    nav_cart: 'سلة الطلبات', nav_language: 'English',

    common_loading: 'جارٍ التحميل...', common_error_generic: 'حدث خطأ ما.', common_retry: 'إعادة المحاولة',
    common_save: 'حفظ', common_cancel: 'إلغاء', common_delete: 'حذف', common_edit: 'تعديل',
    common_confirm: 'تأكيد', common_close: 'إغلاق', common_back_to_menu: 'تصفح القائمة',

    home_hero_cta: 'اطلب الآن', home_hero_secondary: 'تصفح القائمة', home_featured: 'الأصناف المميزة',
    home_categories: 'الأقسام', home_reviews: 'آراء عملائنا', home_gallery: 'من أجواء المقهى',

    menu_title: 'قائمتنا', menu_search_placeholder: 'ابحث في القائمة...', menu_all: 'الكل',
    menu_empty: 'لا توجد منتجات في هذا القسم حالياً.',

    product_add_to_cart: 'أضف إلى السلة', product_available: 'متوفر', product_unavailable: 'غير متوفر',
    product_unavailable_full: 'هذا المنتج غير متاح للطلب حالياً.', product_added: 'تمت الإضافة إلى السلة.',
    product_view_cart: 'عرض السلة', product_not_found: 'هذا المنتج غير موجود.',

    cart_title: 'سلة الطلبات', cart_empty: 'السلة فارغة حالياً.', cart_subtotal: 'المجموع الفرعي',
    cart_discount: 'الخصم', cart_coupon_placeholder: 'كود الخصم', cart_coupon_apply: 'تطبيق',
    cart_continue: 'متابعة إلى الدفع', cart_clear: 'إفراغ السلة', cart_clear_confirm_title: 'إفراغ السلة',
    cart_clear_confirm_message: 'هل تريد حذف جميع المنتجات من السلة؟',
    cart_delivery_note: 'سيتم إضافة رسوم التوصيل والضريبة (إن وجدت) عند إتمام الطلب حسب طريقة الاستلام.',

    checkout_title: 'إتمام الطلب', checkout_order_type: 'طريقة الاستلام', checkout_pickup: 'استلام من الفرع',
    checkout_delivery: 'توصيل', checkout_dine_in: 'تناول داخل المقهى', checkout_contact_info: 'بيانات التواصل',
    checkout_name: 'الاسم', checkout_phone: 'رقم الهاتف', checkout_email: 'البريد الإلكتروني (اختياري)',
    checkout_address: 'عنوان التوصيل', checkout_saved_address: 'عنوان محفوظ', checkout_new_address: 'عنوان جديد',
    checkout_recipient_name: 'اسم المستلم', checkout_recipient_phone: 'هاتف المستلم', checkout_address_line: 'العنوان بالتفصيل',
    checkout_city: 'المدينة', checkout_table_number: 'رقم الطاولة', checkout_payment_method: 'طريقة الدفع',
    checkout_pay_cash: 'الدفع نقداً عند الاستلام', checkout_pay_card: 'بطاقة عند الاستلام (قريباً)',
    checkout_pay_online: 'الدفع الإلكتروني الآن', checkout_notes: 'ملاحظات (اختياري)',
    checkout_summary: 'ملخص الطلب', checkout_delivery_fee: 'رسوم التوصيل', checkout_tax: 'الضريبة',
    checkout_total: 'الإجمالي', checkout_confirm: 'تأكيد الطلب', checkout_submitting: 'جارٍ إرسال الطلب...',
    checkout_guest_prompt_login: 'سجّل الدخول', checkout_guest_prompt_prefix: 'تطلب كضيف الآن، أو',
    checkout_guest_prompt_suffix: 'لحفظ عناوينك ومتابعة طلباتك لاحقاً.',
    checkout_empty_cart: 'لا توجد منتجات في السلة لإتمام الطلب.',

    order_title: 'طلب رقم', order_placed_success: 'تم استلام طلبك بنجاح! رقم الطلب:',
    order_save_link: 'احفظ رابط هذه الصفحة لمتابعة حالة طلبك لاحقاً.', order_products: 'المنتجات',
    order_details: 'تفاصيل الطلب', order_type_label: 'طريقة الاستلام', order_payment_method: 'طريقة الدفع',
    order_payment_status: 'حالة الدفع', order_paid: 'مدفوع', order_unpaid: 'غير مدفوع',
    order_not_found: 'تعذر العثور على هذا الطلب. تأكد من الرابط أو سجّل الدخول لعرض طلباتك.',

    status_new: 'تم استلام الطلب', status_accepted: 'تم قبول الطلب', status_preparing: 'جارٍ التحضير',
    status_ready: 'الطلب جاهز', status_out_for_delivery: 'في الطريق إليك', status_completed: 'تم التسليم',
    status_cancelled: 'تم إلغاء الطلب',

    login_title: 'تسجيل الدخول', login_subtitle: 'سجّل الدخول لمتابعة طلباتك وعناوينك المحفوظة',
    login_identifier: 'البريد الإلكتروني أو رقم الهاتف', login_password: 'كلمة المرور',
    login_submit: 'تسجيل الدخول', login_no_account: 'ليس لديك حساب؟', login_register_link: 'إنشاء حساب جديد',

    register_title: 'إنشاء حساب', register_subtitle: 'احفظ عناوينك وتابع طلباتك بسهولة',
    register_name: 'الاسم', register_email: 'البريد الإلكتروني', register_phone: 'رقم الهاتف',
    register_password: 'كلمة المرور', register_submit: 'إنشاء الحساب',
    register_has_account: 'لديك حساب بالفعل؟', register_login_link: 'تسجيل الدخول',

    orders_title: 'طلباتي', orders_empty: 'لا توجد طلبات سابقة.', orders_number: 'رقم الطلب',
    orders_date: 'التاريخ', orders_status: 'الحالة', orders_total: 'الإجمالي', orders_details: 'التفاصيل',

    profile_title: 'حسابي', profile_personal_data: 'بياناتي الشخصية', profile_addresses: 'عناويني',
    profile_no_addresses: 'لا توجد عناوين محفوظة بعد.', profile_add_address: 'إضافة عنوان جديد',
    profile_edit_address: 'تعديل العنوان', profile_default_address: 'اجعله العنوان الافتراضي',

    about_title: 'من نحن', gallery_title: 'معرض الصور', contact_title: 'تواصل معنا',
  },
  en: {
    nav_home: 'Home', nav_menu: 'Menu', nav_about: 'About', nav_gallery: 'Gallery',
    nav_contact: 'Contact', nav_orders: 'My Orders', nav_login: 'Log In', nav_order_now: 'Order Now',
    nav_cart: 'Cart', nav_language: 'العربية',

    common_loading: 'Loading...', common_error_generic: 'Something went wrong.', common_retry: 'Retry',
    common_save: 'Save', common_cancel: 'Cancel', common_delete: 'Delete', common_edit: 'Edit',
    common_confirm: 'Confirm', common_close: 'Close', common_back_to_menu: 'Browse the menu',

    home_hero_cta: 'Order Now', home_hero_secondary: 'Browse the menu', home_featured: 'Featured items',
    home_categories: 'Categories', home_reviews: 'What our customers say', home_gallery: 'Inside our café',

    menu_title: 'Our Menu', menu_search_placeholder: 'Search the menu...', menu_all: 'All',
    menu_empty: 'No products in this category right now.',

    product_add_to_cart: 'Add to cart', product_available: 'Available', product_unavailable: 'Unavailable',
    product_unavailable_full: 'This product is not currently available to order.', product_added: 'Added to your cart.',
    product_view_cart: 'View cart', product_not_found: 'This product could not be found.',

    cart_title: 'Your Cart', cart_empty: 'Your cart is empty.', cart_subtotal: 'Subtotal',
    cart_discount: 'Discount', cart_coupon_placeholder: 'Coupon code', cart_coupon_apply: 'Apply',
    cart_continue: 'Continue to checkout', cart_clear: 'Clear cart', cart_clear_confirm_title: 'Clear cart',
    cart_clear_confirm_message: 'Remove all items from your cart?',
    cart_delivery_note: 'Delivery fee and tax (if any) are added at checkout based on how you choose to receive your order.',

    checkout_title: 'Checkout', checkout_order_type: 'How would you like to receive your order?', checkout_pickup: 'Pickup',
    checkout_delivery: 'Delivery', checkout_dine_in: 'Dine-in', checkout_contact_info: 'Contact information',
    checkout_name: 'Name', checkout_phone: 'Phone number', checkout_email: 'Email (optional)',
    checkout_address: 'Delivery address', checkout_saved_address: 'Saved address', checkout_new_address: 'New address',
    checkout_recipient_name: 'Recipient name', checkout_recipient_phone: 'Recipient phone', checkout_address_line: 'Full address',
    checkout_city: 'City', checkout_table_number: 'Table number', checkout_payment_method: 'Payment method',
    checkout_pay_cash: 'Cash on pickup/delivery', checkout_pay_card: 'Card on pickup/delivery (coming soon)',
    checkout_pay_online: 'Pay online now', checkout_notes: 'Notes (optional)',
    checkout_summary: 'Order summary', checkout_delivery_fee: 'Delivery fee', checkout_tax: 'Tax',
    checkout_total: 'Total', checkout_confirm: 'Place order', checkout_submitting: 'Placing your order...',
    checkout_guest_prompt_login: 'log in', checkout_guest_prompt_prefix: 'Checking out as a guest, or',
    checkout_guest_prompt_suffix: 'to save addresses and track your orders.',
    checkout_empty_cart: 'Your cart is empty — add something from the menu first.',

    order_title: 'Order #', order_placed_success: 'Your order was placed successfully! Order number:',
    order_save_link: 'Save this page\'s link to track your order later.', order_products: 'Items',
    order_details: 'Order details', order_type_label: 'Fulfillment', order_payment_method: 'Payment method',
    order_payment_status: 'Payment status', order_paid: 'Paid', order_unpaid: 'Unpaid',
    order_not_found: "We couldn't find this order. Check the link, or log in to see your orders.",

    status_new: 'Order received', status_accepted: 'Order accepted', status_preparing: 'Being prepared',
    status_ready: 'Ready', status_out_for_delivery: 'On the way', status_completed: 'Delivered',
    status_cancelled: 'Order cancelled',

    login_title: 'Log In', login_subtitle: 'Log in to track your orders and saved addresses',
    login_identifier: 'Email or phone number', login_password: 'Password',
    login_submit: 'Log In', login_no_account: "Don't have an account?", login_register_link: 'Create one',

    register_title: 'Create an Account', register_subtitle: 'Save your addresses and track orders easily',
    register_name: 'Name', register_email: 'Email', register_phone: 'Phone number',
    register_password: 'Password', register_submit: 'Create account',
    register_has_account: 'Already have an account?', register_login_link: 'Log in',

    orders_title: 'My Orders', orders_empty: 'No past orders yet.', orders_number: 'Order #',
    orders_date: 'Date', orders_status: 'Status', orders_total: 'Total', orders_details: 'Details',

    profile_title: 'My Account', profile_personal_data: 'Personal information', profile_addresses: 'My Addresses',
    profile_no_addresses: 'No saved addresses yet.', profile_add_address: 'Add a new address',
    profile_edit_address: 'Edit address', profile_default_address: 'Set as default address',

    about_title: 'About Us', gallery_title: 'Gallery', contact_title: 'Contact Us',
  },
};
