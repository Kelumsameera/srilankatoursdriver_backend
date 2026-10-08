# Business / contact data – MANUAL VERIFICATION REQUIRED

Extracted from the public old website. Verify every value with the business owner before it is imported into Site Settings.

> Map embed URLs have their API key redacted. No secret values are included in this report.

## Proposed Site Settings values

```json
{
  "key": "default",
  "siteName": "Sri Lanka Tours Driver",
  "businessName": "Sri Lanka Tours Driver",
  "tagline": "Sri Lanka Best Tour Drivers Company",
  "address": "No:96, Maddawaththa, Halthota, Bandaragama, Sri Lanka.",
  "googleMapsUrl": "https://goo.gl/maps/wrVxucvyXjUseDRS6",
  "phone": "+94769300334",
  "whatsapp": "+94769300334",
  "email": "info@srilankatoursdriver.com",
  "businessHours": "Open 24 Hours | 7 Days",
  "websiteUrl": "https://srilankatoursdriver.com",
  "social": {
    "tripadvisor": "https://www.tripadvisor.com/Attraction_Review-g293962-d23985020-Reviews-Sri_Lanka_Tours_Driver-Colombo_Western_Province.html",
    "instagram": "https://www.instagram.com/srilankatoursdriver/",
    "facebook": "https://www.facebook.com/srilankatoursdriver",
    "youtube": "https://www.youtube.com/channel/UC2CNnfA5zDLKQjtV7ogxwdA",
    "twitter": "https://twitter.com/SLToursDriver"
  },
  "footer": {
    "description": "A smiling sun all year round, golden beaches, ancient cities, safaris, lovely people a in a tropical paradise, mouth watering foods Sri Lanka unforgettable travelling experience you can ever imagine, we are licensed tour guide team in Colombo-Sri Lanka.",
    "columns": [
      {
        "title": "Quick Menu",
        "links": [
          {
            "label": "Gallery",
            "url": "/gallery"
          },
          {
            "label": "About Us",
            "url": "/about-us"
          },
          {
            "label": "Contact Us",
            "url": "/contact"
          },
          {
            "label": "Airport Transfers",
            "url": "/airport-transfers/"
          },
          {
            "label": "Tailor Made Tours",
            "url": "/tailor-made-tours"
          },
          {
            "label": "Sri Lanka One Day Tours",
            "url": "/tours?category=one-day-tours"
          }
        ],
        "enabled": true
      },
      {
        "title": "Most Popular",
        "links": [
          {
            "label": "Special Offers",
            "url": "/tours?category=offers"
          },
          {
            "label": "5 Days to Down South",
            "url": "/to_book/5-days-tour-sri-lanka/"
          },
          {
            "label": "5 Days to East Coast",
            "url": "/to_book/5-days-east-coast-tour-sri-lanka/"
          },
          {
            "label": "8 Days to Down South",
            "url": "/to_book/8-days-down-south-tour-sri-lanka/"
          },
          {
            "label": "8 Days to East Coast",
            "url": "/to_book/8-days-east-coast-tour/"
          }
        ],
        "enabled": true
      }
    ],
    "copyright": "Copyright © 2024 Sri Lanka Tours Driver. All Rights Reserved."
  },
  "tripadvisor": {
    "enabled": true,
    "profileUrl": "https://www.tripadvisor.com/Attraction_Review-g293962-d23985020-Reviews-Sri_Lanka_Tours_Driver-Colombo_Western_Province.html"
  }
}
```

### Warnings

- **address:** 2 different values on the old site – pick one manually (see business-data report)
- **email:** a placeholder address (example.com) appears on the old site – ignored
- **googleMapsUrl:** 3 different business map links/embeds on the old site – confirm which one is current
- **siteName:** WordPress name "Sri Lanka Tours Drivers" differs from og:site_name "Sri Lanka Tours Driver"

## siteName

| Value | Pages | Found on (evidence) |
| --- | --- | --- |
| Sri Lanka Tours Driver | 71 | / (og:site_name); /about-us/ (og:site_name); /all-tours/ (og:site_name); /contact/ (og:site_name) … |

## address

| Value | Pages | Found on (evidence) |
| --- | --- | --- |
| No:96, Maddawaththa, Halthota, Bandaragama, Sri Lanka. | 71 | / (icon box "Address:"); /about-us/ (icon box "Address:"); /all-tours/ (icon box "Address:"); /contact/ (icon box "Address:") … |
| No:96, Maddawaththa, Halthota, Bandaragama, Sri Lanka, 12530. | 1 | /contact/ (icon box "Address") |

## phone

| Value | Pages | Found on (evidence) |
| --- | --- | --- |
| +94769300334 | 71 | / (tel: link "(+94) 769 300 334"); /about-us/ (tel: link "(+94) 769 300 334"); /all-tours/ (tel: link "(+94) 769 300 334"); /contact/ (tel: link "(+94) 769 300 334") … |

## whatsapp

| Value | Pages | Found on (evidence) |
| --- | --- | --- |
| +94769300334 | 71 | / (WhatsApp link https://wa.me/+94769300334); /about-us/ (WhatsApp link https://wa.me/+94769300334); /all-tours/ (WhatsApp link https://wa.me/+94769300334); /contact/ (icon box "WhatsApp": (+94) 769 300 334) … |

## email

| Value | Pages | Found on (evidence) |
| --- | --- | --- |
| info@srilankatoursdriver.com | 71 | / (mailto: link); /about-us/ (mailto: link); /all-tours/ (mailto: link); /contact/ (icon box "Email") … |
| contact@example.com | 1 | /contact/ (mailto: link) |

## businessHours

| Value | Pages | Found on (evidence) |
| --- | --- | --- |
| Open 24 Hours \| 7 Days | 1 | /contact/ (icon box "Business Hours") |

## socials

| Value | Pages | Found on (evidence) |
| --- | --- | --- |
| {"platform":"tripadvisor","url":"https://www.tripadvisor.com/Attraction_Review-g293962-d23985020-Reviews-Sri_Lanka_Tours_Driver-Colombo_Western_Province.html"} | 71 | / (link "tripadvisor"); /about-us/ (link "Tripadvisor"); /all-tours/ (link "Tripadvisor"); /contact/ (link "Tripadvisor") … |
| {"platform":"instagram","url":"https://www.instagram.com/srilankatoursdriver/"} | 71 | / (link "Follow on Instagram"); /about-us/ (link "Instagram"); /all-tours/ (link "Instagram"); /contact/ (link "Instagram") … |
| {"platform":"facebook","url":"https://www.facebook.com/srilankatoursdriver"} | 71 | / (link "Facebook"); /about-us/ (link "Facebook"); /all-tours/ (link "Facebook"); /contact/ (link "Facebook") … |
| {"platform":"youtube","url":"https://www.youtube.com/channel/UC2CNnfA5zDLKQjtV7ogxwdA"} | 71 | / (link "Youtube"); /about-us/ (link "Youtube"); /all-tours/ (link "Youtube"); /contact/ (link "Youtube") … |
| {"platform":"twitter","url":"https://twitter.com/SLToursDriver"} | 71 | / (link "Twitter"); /about-us/ (link "Twitter"); /all-tours/ (link "Twitter"); /contact/ (link "Twitter") … |

## maps

| Value | Pages | Found on (evidence) |
| --- | --- | --- |
| {"kind":"link","url":"https://goo.gl/maps/wrVxucvyXjUseDRS6","query":null} | 19 | / (map link ""); /about-us/ (map link ""); /all-tours/ (map link ""); /contact/ (map link "") … |
| {"kind":"link","url":"https://goo.gl/maps/jyHJkiXsQ3Vz1JTQA","query":null} | 1 | /contact/ (map link "") |
| {"kind":"embed","url":"https://www.google.com/maps/embed/v1/place?key=<redacted>&q=Sri+Lanka+Tours+Driver+Bandaragama&zoom=10","query":"Sri Lanka Tours Driver Bandaragama"} | 1 | /contact/ (Google Maps iframe (API key redacted)) |

## iconBoxes

| Title | Text |
| --- | --- |
| Best Travel Agent | One of the best leading tour operator in Sri Lanka tourism industry |
| Beautiful Places | A smiling sun all year round, golden beaches, ancient exiting cities, safaris, lovely people in a tropical paradise. |
| Tailor Made Tours | We provide the best custom-made & specialized Sri Lanka tours to our clients. |
| Transportation | We Arrange Reliable Transportation And Airport Transfers For Single/Couple Travelers, Families or Groups. |
| Best Price Guarantee | Customers will get a service proportionate to the price they have paid. |
| Fast Booking | You can reach us via Email or WhatsApp in 24/7 |
| Address: | No:96, Maddawaththa, Halthota, Bandaragama, Sri Lanka. |
| Address | No:96, Maddawaththa, Halthota, Bandaragama, Sri Lanka, 12530. |
| WhatsApp | (+94) 769 300 334 |
| Email | info@srilankatoursdriver.com |
| Business Hours | Open 24 Hours \| 7 Days |

